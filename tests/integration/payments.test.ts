import { describe, expect, it } from "vitest";
import * as payments from "@/lib/domain/payments/service";
import * as expenses from "@/lib/domain/expenses/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as overview from "@/lib/domain/overview/service";
import { setupTestDb, unwrap, key, residenceWithOpenCycle } from "./helpers";

setupTestDb();

describe("payments", () => {
  it("settles several lots at once, one of them partly, and keeps the note", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    const payment = unwrap(
      await payments.recordPayment(session, residence.id, {
        payerName: "Payer",
        date: "2026-03-02",
        method: "CHECK",
        note: "Chèque n° 4471",
        idempotencyKey: key(),
        allocations: [
          { assessmentId: assessmentOf("A11"), amountMillimes: "1000" },
          { assessmentId: assessmentOf("A12"), amountMillimes: "500" },
        ],
      }),
    );
    expect(payment).toMatchObject({ amountMillimes: 1_500_000, note: "Chèque n° 4471", method: "CHECK" });

    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.find((r) => r.code === "A11")?.status).toBe("PAID");
    expect(rows.find((r) => r.code === "A12")).toMatchObject({ status: "PARTIAL", paidMillimes: 500_000 });

    // The rest of A12 is completed later.
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-04-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A12"), amountMillimes: "1000" }],
      }),
    );
    const after = await overview.getLotRows(session, residence.id, cycle.id);
    expect(after.find((r) => r.code === "A12")?.status).toBe("PAID");
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))).toHaveLength(2);
  });

  it("refuses to overpay a lot", async () => {
    const { session, residence, assessmentOf } = await residenceWithOpenCycle();
    const result = await payments.recordPayment(session, residence.id, {
      date: "2026-03-02",
      method: "CASH",
      idempotencyKey: key(),
      allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1000.001" }],
    });
    expect(result).toMatchObject({ ok: false, code: "OVER_ALLOCATION" });
  });

  it("is idempotent on retry", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    const input = {
      date: "2026-03-02",
      method: "CASH" as const,
      idempotencyKey: key(),
      allocations: [{ assessmentId: assessmentOf("B11"), amountMillimes: "100" }],
    };
    const first = unwrap(await payments.recordPayment(session, residence.id, input));
    const second = unwrap(await payments.recordPayment(session, residence.id, input));
    expect(second.id).toBe(first.id);
    const treasury = unwrap(await cycles.getCycleTreasury(session, residence.id, cycle.id));
    expect(treasury.incomeMillimes).toBe(100_000);
  });

  it("rejects payments once the cycle is closed", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const result = await payments.recordPayment(session, residence.id, {
      date: "2026-03-02",
      method: "CASH",
      idempotencyKey: key(),
      allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1" }],
    });
    expect(result).toMatchObject({ ok: false, code: "CYCLE_NOT_OPEN" });
  });

  it("cancelling a payment restores what the lot owes", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    const payment = unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-03-02",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "400" }],
      }),
    );
    unwrap(await payments.cancelPayment(session, residence.id, { paymentId: payment.id, reason: "typo" }));
    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.find((r) => r.code === "A11")).toMatchObject({ status: "UNPAID", paidMillimes: 0 });
  });
});

describe("editing and deleting payments", () => {
  const pay = async (ctx: Awaited<ReturnType<typeof residenceWithOpenCycle>>, codes: [string, string][]) =>
    unwrap(
      await payments.recordPayment(ctx.session, ctx.residence.id, {
        date: "2026-03-02",
        method: "CASH",
        idempotencyKey: key(),
        allocations: codes.map(([c, amount]) => ({ assessmentId: ctx.assessmentOf(c), amountMillimes: amount })),
      }),
    );
  const lotRow = async (ctx: Awaited<ReturnType<typeof residenceWithOpenCycle>>, code: string) =>
    (await overview.getLotRows(ctx.session, ctx.residence.id, ctx.cycle.id)).find((r) => r.code === code)!;

  it("replaces the units and amounts of a payment, moving what each unit owes", async () => {
    const ctx = await residenceWithOpenCycle();
    const payment = await pay(ctx, [["A11", "1000"]]);
    expect((await lotRow(ctx, "A11")).status).toBe("PAID");

    const edited = unwrap(
      await payments.updatePayment(ctx.session, ctx.residence.id, {
        paymentId: payment.id,
        date: "2026-03-05",
        method: "CHECK",
        note: "corrected",
        allocations: [
          { assessmentId: ctx.assessmentOf("A11"), amountMillimes: "400" },
          { assessmentId: ctx.assessmentOf("B11"), amountMillimes: "2000" },
        ],
      }),
    );
    expect(edited).toMatchObject({ id: payment.id, amountMillimes: 2_400_000, method: "CHECK", note: "corrected" });
    expect(await lotRow(ctx, "A11")).toMatchObject({ status: "PARTIAL", paidMillimes: 400_000 });
    expect((await lotRow(ctx, "B11")).status).toBe("PAID");
    const treasury = unwrap(await cycles.getCycleTreasury(ctx.session, ctx.residence.id, ctx.cycle.id));
    expect(treasury.incomeMillimes).toBe(2_400_000);
  });

  it("lets a payment keep the amount it already covers, but never overpay", async () => {
    const ctx = await residenceWithOpenCycle();
    const payment = await pay(ctx, [["A11", "1000"]]);
    // A11 is fully paid by this very payment: re-saving the same amount is fine…
    unwrap(
      await payments.updatePayment(ctx.session, ctx.residence.id, {
        paymentId: payment.id,
        date: "2026-03-02",
        method: "CASH",
        allocations: [{ assessmentId: ctx.assessmentOf("A11"), amountMillimes: "1000" }],
      }),
    );
    // …but more than the unit's charge is refused, and nothing changes.
    const over = await payments.updatePayment(ctx.session, ctx.residence.id, {
      paymentId: payment.id,
      date: "2026-03-02",
      method: "CASH",
      allocations: [{ assessmentId: ctx.assessmentOf("A11"), amountMillimes: "1000.001" }],
    });
    expect(over).toMatchObject({ ok: false, code: "OVER_ALLOCATION" });
    expect((await lotRow(ctx, "A11")).paidMillimes).toBe(1_000_000);
  });

  it("freezes payments once their cycle is closed", async () => {
    const ctx = await residenceWithOpenCycle();
    const payment = await pay(ctx, [["A11", "100"]]);
    unwrap(await cycles.closeCycle(ctx.session, ctx.residence.id, { cycleId: ctx.cycle.id }));
    expect(
      await payments.cancelPayment(ctx.session, ctx.residence.id, { paymentId: payment.id, reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "CYCLE_NOT_OPEN",
    });
    expect(
      await payments.updatePayment(ctx.session, ctx.residence.id, {
        paymentId: payment.id,
        date: "2026-03-02",
        method: "CASH",
        allocations: [{ assessmentId: ctx.assessmentOf("A11"), amountMillimes: "50" }],
      }),
    ).toMatchObject({ ok: false, code: "CYCLE_NOT_OPEN" });
  });
});

describe("expenses", () => {
  it("records against the open cycle and groups by month", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    for (const [label, amount, date] of [
      ["Salaire concierge", "700", "2026-01-05"],
      ["STEG ascenseur A", "336", "2026-01-20"],
      ["Rapide Ascenseur", "480", "2026-02-10"],
    ]) {
      unwrap(
        await expenses.recordExpense(session, residence.id, {
          label,
          amountMillimes: amount,
          date,
          idempotencyKey: key(),
        }),
      );
    }
    const months = await overview.getExpenseMonths(session, residence.id, cycle.id);
    expect(months.map((m) => [m.month, m.totalMillimes, m.items.length])).toEqual([
      ["2026-01", 1_036_000, 2],
      ["2026-02", 480_000, 1],
    ]);
  });

  it("needs an open cycle", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const result = await expenses.recordExpense(session, residence.id, {
      label: "x",
      amountMillimes: "1",
      date: "2026-01-01",
      idempotencyKey: key(),
    });
    expect(result).toMatchObject({ ok: false, code: "CYCLE_NOT_OPEN" });
  });
});

describe("editing and deleting expenses", () => {
  it("edits an expense and deletes another, and the treasury follows", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    const record = async (label: string, amount: string) =>
      unwrap(
        await expenses.recordExpense(session, residence.id, {
          label,
          amountMillimes: amount,
          date: "2026-02-01",
          idempotencyKey: key(),
        }),
      );
    const a = await record("STEG", "300");
    const b = await record("Typo", "50");

    const edited = unwrap(
      await expenses.updateExpense(session, residence.id, {
        expenseId: a.id,
        label: "STEG ascenseur",
        amountMillimes: "336",
        reference: "Chèque 12",
        date: "2026-03-01",
      }),
    );
    expect(edited).toMatchObject({ label: "STEG ascenseur", amountMillimes: 336_000, reference: "Chèque 12" });
    unwrap(await expenses.cancelExpense(session, residence.id, { expenseId: b.id, reason: "typo" }));

    const months = await overview.getExpenseMonths(session, residence.id, cycle.id);
    expect(months.map((m) => [m.month, m.totalMillimes])).toEqual([["2026-03", 336_000]]);
    expect(unwrap(await cycles.getCycleTreasury(session, residence.id, cycle.id)).expenseMillimes).toBe(336_000);
  });

  it("freezes expenses once their cycle is closed", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    const e = unwrap(
      await expenses.recordExpense(session, residence.id, {
        label: "x",
        amountMillimes: "10",
        date: "2026-02-01",
        idempotencyKey: key(),
      }),
    );
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    expect(await expenses.cancelExpense(session, residence.id, { expenseId: e.id, reason: "x" })).toMatchObject({
      code: "CYCLE_NOT_OPEN",
    });
    expect(
      await expenses.updateExpense(session, residence.id, {
        expenseId: e.id,
        label: "y",
        amountMillimes: "5",
        date: "2026-02-01",
      }),
    ).toMatchObject({ code: "CYCLE_NOT_OPEN" });
  });
});

describe("overview", () => {
  it("summarises lots, blocs and treasury for the dashboard", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-03-02",
        method: "BANK_TRANSFER",
        idempotencyKey: key(),
        allocations: [
          { assessmentId: assessmentOf("A11"), amountMillimes: "1000" },
          { assessmentId: assessmentOf("B11"), amountMillimes: "500" },
        ],
      }),
    );
    unwrap(
      await expenses.recordExpense(session, residence.id, {
        label: "x",
        amountMillimes: "200",
        date: "2026-03-03",
        idempotencyKey: key(),
      }),
    );

    const current = unwrap(await cycles.listCycles(session, residence.id)).find((c) => c.id === cycle.id)!;
    const data = await overview.getCycleOverview(session, residence.id, current);
    expect(data.totals).toMatchObject({
      expectedMillimes: 4_500_000,
      collectedMillimes: 1_500_000,
      outstandingMillimes: 3_000_000,
      paid: 1,
      partial: 1,
      unpaid: 1,
    });
    expect(data.blocs.map((b) => [b.name, b.lotCount, b.paidCount, b.collectedMillimes])).toEqual([
      ["Bloc A", 2, 1, 1_000_000],
      ["Bloc B", 1, 0, 500_000],
    ]);
    expect(data.treasury).toMatchObject({
      incomeMillimes: 1_500_000,
      expenseMillimes: 200_000,
      closingBalanceMillimes: 1_300_000,
    });
  });
});
