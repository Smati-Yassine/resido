import { describe, expect, it } from "vitest";
import * as buildings from "@/lib/domain/buildings/service";
import * as lots from "@/lib/domain/lots/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as payments from "@/lib/domain/payments/service";
import * as expenses from "@/lib/domain/expenses/service";
import * as overview from "@/lib/domain/overview/service";
import { setupTestDb, unwrap, key, residenceWithOpenCycle } from "./helpers";

setupTestDb();

describe("blocs and lots", () => {
  it("bills a lot added mid-cycle in the open cycle", async () => {
    const { session, residence, blocB, cycle } = await residenceWithOpenCycle();
    unwrap(
      await lots.createLot(session, residence.id, {
        buildingId: blocB.id,
        code: "B12",
        chargeMillimes: "750.500",
      }),
    );

    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.map((r) => r.code)).toEqual(["A11", "A12", "B11", "B12"]);
    expect(rows.find((r) => r.code === "B12")).toMatchObject({
      blocName: "Bloc B",
      dueMillimes: 750500,
      status: "UNPAID",
    });
  });

  it("rejects duplicate lot codes and duplicate bloc names", async () => {
    const { session, residence, blocA } = await residenceWithOpenCycle();
    const lot = await lots.createLot(session, residence.id, {
      buildingId: blocA.id,
      code: "A11",
      chargeMillimes: "10",
    });
    expect(lot).toMatchObject({ ok: false, code: "DUPLICATE_CODE" });
    const bloc = await buildings.createBuilding(session, residence.id, {
      name: "bloc a",
    });
    expect(bloc).toMatchObject({ ok: false, code: "DUPLICATE_NAME" });
  });

  it("rejects a zero charge", async () => {
    const { session, residence, blocA } = await residenceWithOpenCycle();
    const lot = await lots.createLot(session, residence.id, {
      buildingId: blocA.id,
      code: "A99",
      chargeMillimes: "0",
    });
    expect(lot.ok).toBe(false);
  });
});

describe("editing and deleting lots", () => {
  it("edits code, bloc, owner and charge — the open cycle bills the new charge", async () => {
    const { session, residence, blocB, cycle, lots: l } = await residenceWithOpenCycle();
    const updated = unwrap(
      await lots.updateLot(session, residence.id, {
        lotId: l.a11.id,
        buildingId: blocB.id,
        code: "B99",
        chargeMillimes: "1250",
        ownerIds: [],
      }),
    );
    expect(updated).toMatchObject({
      code: "B99",
      buildingId: blocB.id,
      chargeMillimes: 1_250_000,
    });
    const row = (await overview.getLotRows(session, residence.id, cycle.id)).find((r) => r.lotId === l.a11.id)!;
    expect(row).toMatchObject({
      code: "B99",
      blocName: "Bloc B",
      dueMillimes: 1_250_000,
    });
  });

  it("refuses a charge below what the lot already paid, and a duplicate code", async () => {
    const { session, residence, blocA, lots: l, assessmentOf } = await residenceWithOpenCycle();
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "800" }],
      }),
    );
    const base = {
      lotId: l.a11.id,
      buildingId: blocA.id,
      code: "A11",
      ownerId: null,
    };
    expect(
      await lots.updateLot(session, residence.id, {
        ...base,
        chargeMillimes: "700",
      }),
    ).toMatchObject({
      code: "CHARGE_BELOW_PAID",
    });
    expect(
      await lots.updateLot(session, residence.id, {
        ...base,
        code: "A12",
        chargeMillimes: "1000",
      }),
    ).toMatchObject({
      code: "DUPLICATE_CODE",
    });
  });

  it("deletes a lot only when it has no history", async () => {
    const { session, residence, cycle, blocA, assessmentOf, lots: l } = await residenceWithOpenCycle();
    const fresh = unwrap(
      await lots.createLot(session, residence.id, {
        buildingId: blocA.id,
        code: "A99",
        chargeMillimes: "10",
      }),
    );
    unwrap(await lots.deleteLot(session, residence.id, fresh.id));
    expect((await overview.getLotRows(session, residence.id, cycle.id)).map((r) => r.code)).toEqual([
      "A11",
      "A12",
      "B11",
    ]);

    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1" }],
      }),
    );
    expect(await lots.deleteLot(session, residence.id, l.a11.id)).toMatchObject({ code: "HAS_HISTORY" });

    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    expect(await lots.deleteLot(session, residence.id, l.b11.id)).toMatchObject({ code: "HAS_HISTORY" });
  });
});

describe("cycles", () => {
  it("opens with one assessment per lot at its annual charge", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    const totals = overview.totalsFromLotRows(await overview.getLotRows(session, residence.id, cycle.id));
    expect(totals).toMatchObject({
      expectedMillimes: 4_500_000,
      collectedMillimes: 0,
      lotCount: 3,
      unpaid: 3,
    });
    expect(cycle.endDate).toBeNull();
    expect(cycle.openingTreasuryBalanceMillimes).toBe(0);
  });

  it("accepts a fixed end date but rejects one before the start", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const ok = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
      }),
    );
    expect(ok.endDate?.toISOString().slice(0, 10)).toBe("2027-12-31");
    const bad = await cycles.createCycle(session, residence.id, {
      name: "x",
      startDate: "2027-01-01",
      endDate: "2026-01-01",
    });
    expect(bad.ok).toBe(false);
  });

  it("allows only one open cycle", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const next = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    expect(await cycles.openCycle(session, residence.id, { cycleId: next.id })).toMatchObject({
      ok: false,
      code: "ANOTHER_CYCLE_OPEN",
    });
  });

  it("closes an open-ended cycle today and carries its balance to the next one", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    unwrap(
      await cycles.setOpeningBalance(session, residence.id, {
        cycleId: cycle.id,
        openingTreasuryBalanceMillimes: "2204.328",
      }),
    );
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1000" }],
      }),
    );
    unwrap(
      await expenses.recordExpense(session, residence.id, {
        label: "STEG",
        amountMillimes: "336",
        date: "2026-02-03",
        idempotencyKey: key(),
      }),
    );

    const closed = unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    // 2204.328 + 1000.000 − 336.000
    expect(closed.closingTreasuryBalanceMillimes).toBe(2_868_328);
    expect(closed.endDate).not.toBeNull();

    const next = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    const opened = unwrap(await cycles.openCycle(session, residence.id, { cycleId: next.id }));
    expect(opened.openingTreasuryBalanceMillimes).toBe(2_868_328);
    expect(opened.previousCycleId).toBe(cycle.id);
    expect((await cycles.computeCycleTreasury(residence.id, opened)).carriedFrom).toMatchObject({ name: "2026" });
  });

  it("reopens a closed cycle, only while no other cycle is open", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const reopened = unwrap(await cycles.reopenCycle(session, residence.id, { cycleId: cycle.id }));
    // Open-ended: the end date stamped at close goes away again.
    expect(reopened).toMatchObject({ status: "OPEN", endDate: null, closedAt: null });

    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const next = unwrap(await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01" }));
    unwrap(await cycles.openCycle(session, residence.id, { cycleId: next.id }));
    expect(await cycles.reopenCycle(session, residence.id, { cycleId: cycle.id })).toMatchObject({
      ok: false,
      code: "ANOTHER_CYCLE_OPEN",
    });
  });

  it("keeps a closed cycle correctable, and the next cycle's start follows it", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    unwrap(
      await cycles.setOpeningBalance(session, residence.id, {
        cycleId: cycle.id,
        openingTreasuryBalanceMillimes: "100",
      }),
    );
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const next = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    const opened = unwrap(await cycles.openCycle(session, residence.id, { cycleId: next.id }));
    const startOf2027 = async () => (await cycles.computeCycleTreasury(residence.id, opened)).openingBalanceMillimes;
    expect(await startOf2027()).toBe(100_000);

    // A late payment and an expense recorded in the closed 2026…
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-12-30",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "300" }],
      }),
    );
    unwrap(
      await expenses.recordExpense(
        session,
        residence.id,
        {
          label: "STEG",
          amountMillimes: "50",
          date: "2026-12-31",
          idempotencyKey: key(),
        },
        cycle.id,
      ),
    );
    // …move 2026's closing balance and, carried over, 2027's start.
    expect(await startOf2027()).toBe(350_000);

    // Typed in, 2027's start stops following; carrying again resumes.
    unwrap(
      await cycles.setOpeningBalance(session, residence.id, {
        cycleId: next.id,
        openingTreasuryBalanceMillimes: "10",
      }),
    );
    unwrap(
      await cycles.setOpeningBalance(session, residence.id, {
        cycleId: cycle.id,
        openingTreasuryBalanceMillimes: "0",
      }),
    );
    expect(await startOf2027()).toBe(10_000);
    unwrap(
      await cycles.setOpeningBalance(session, residence.id, {
        cycleId: next.id,
        carry: true,
      }),
    );
    expect(await startOf2027()).toBe(250_000);
  });

  it("deletes a cycle with its charges, payments and expenses, and relinks the chain", async () => {
    const { session, residence, cycle, assessmentOf } = await residenceWithOpenCycle();
    unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1000" }],
      }),
    );
    unwrap(
      await expenses.recordExpense(session, residence.id, {
        label: "x",
        amountMillimes: "5",
        date: "2026-02-03",
        idempotencyKey: key(),
      }),
    );
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: cycle.id }));
    const next = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    expect(next.previousCycleId).toBe(cycle.id);

    unwrap(await cycles.deleteCycle(session, residence.id, { cycleId: cycle.id }));

    const remaining = unwrap(await cycles.listCycles(session, residence.id));
    expect(remaining.map((c) => [c.name, c.previousCycleId])).toEqual([["2027", null]]);
    expect(await overview.getLotRows(session, residence.id, cycle.id)).toEqual([]);
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))).toEqual([]);
    expect(await overview.getExpenseMonths(session, residence.id, cycle.id)).toEqual([]);

    // With nothing before it any more, the next cycle opens from a zero balance.
    const opened = unwrap(await cycles.openCycle(session, residence.id, { cycleId: next.id }));
    expect(opened.openingTreasuryBalanceMillimes).toBe(0);
  });

  it("can delete the open cycle, freeing a draft to open", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    const draft = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    unwrap(await cycles.deleteCycle(session, residence.id, { cycleId: cycle.id }));
    expect((await cycles.openCycle(session, residence.id, { cycleId: draft.id })).ok).toBe(true);
  });
});
