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
      await lots.createLot(session, residence.id, { buildingId: blocB.id, code: "B12", chargeMillimes: "750.500" }),
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
    const bloc = await buildings.createBuilding(session, residence.id, { name: "bloc a" });
    expect(bloc).toMatchObject({ ok: false, code: "DUPLICATE_NAME" });
  });

  it("rejects a zero charge", async () => {
    const { session, residence, blocA } = await residenceWithOpenCycle();
    const lot = await lots.createLot(session, residence.id, { buildingId: blocA.id, code: "A99", chargeMillimes: "0" });
    expect(lot.ok).toBe(false);
  });
});

describe("cycles", () => {
  it("opens with one assessment per lot at its annual charge", async () => {
    const { session, residence, cycle } = await residenceWithOpenCycle();
    const totals = overview.totalsFromLotRows(await overview.getLotRows(session, residence.id, cycle.id));
    expect(totals).toMatchObject({ expectedMillimes: 4_500_000, collectedMillimes: 0, lotCount: 3, unpaid: 3 });
    expect(cycle.endDate).toBeNull();
    expect(cycle.openingTreasuryBalanceMillimes).toBe(0);
  });

  it("accepts a fixed end date but rejects one before the start", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const ok = unwrap(
      await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" }),
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
    const next = unwrap(await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01" }));
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

    // A closed cycle's opening balance is frozen.
    const frozen = await cycles.setOpeningBalance(session, residence.id, {
      cycleId: cycle.id,
      openingTreasuryBalanceMillimes: "1",
    });
    expect(frozen.ok).toBe(false);

    const next = unwrap(await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01" }));
    const opened = unwrap(await cycles.openCycle(session, residence.id, { cycleId: next.id }));
    expect(opened.openingTreasuryBalanceMillimes).toBe(2_868_328);
    expect(opened.previousCycleId).toBe(cycle.id);
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
    const next = unwrap(await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01" }));
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
    const draft = unwrap(await cycles.createCycle(session, residence.id, { name: "2027", startDate: "2027-01-01" }));
    unwrap(await cycles.deleteCycle(session, residence.id, { cycleId: cycle.id }));
    expect((await cycles.openCycle(session, residence.id, { cycleId: draft.id })).ok).toBe(true);
  });
});
