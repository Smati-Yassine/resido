import { describe, expect, it } from "vitest";
import * as owners from "@/lib/domain/owners/service";
import * as lots from "@/lib/domain/lots/service";
import * as payments from "@/lib/domain/payments/service";
import * as overview from "@/lib/domain/overview/service";
import { setupTestDb, unwrap, key, residenceWithOpenCycle, adminSession, newUserId } from "./helpers";

setupTestDb();

describe("owners", () => {
  it("creates an owner holding the chosen lots, shown on the lot rows", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const owner = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "Owner One",
        phone: "+216 00 000 000",
        lotIds: [l.a11.id, l.b11.id],
      }),
    );
    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.filter((r) => r.ownerId === owner.id).map((r) => [r.code, r.ownerName])).toEqual([
      ["A11", "Owner One"],
      ["B11", "Owner One"],
    ]);
    expect(rows.find((r) => r.code === "A12")?.ownerId).toBeNull();
  });

  it("moves a lot from one owner to another, and editing replaces the owner's lots", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const first = unwrap(
      await owners.createOwner(session, residence.id, { name: "First", lotIds: [l.a11.id, l.a12.id] }),
    );
    const second = unwrap(await owners.createOwner(session, residence.id, { name: "Second", lotIds: [l.a12.id] }));

    let rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.find((r) => r.code === "A12")?.ownerId).toBe(second.id);

    unwrap(await owners.updateOwner(session, residence.id, first.id, { name: "First renamed", lotIds: [l.b11.id] }));
    rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.map((r) => [r.code, r.ownerName])).toEqual([
      ["A11", null],
      ["A12", "Second"],
      ["B11", "First renamed"],
    ]);
  });

  it("assigns an owner from the lot side, and deleting the owner frees their lots", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const owner = unwrap(await owners.createOwner(session, residence.id, { name: "Owner", lotIds: [] }));
    unwrap(await lots.setLotOwner(session, residence.id, { lotId: l.a11.id, ownerId: owner.id }));
    expect((await overview.getLotRows(session, residence.id, cycle.id))[0].ownerName).toBe("Owner");

    unwrap(await owners.deleteOwner(session, residence.id, owner.id));
    expect((await overview.getLotRows(session, residence.id, cycle.id))[0].ownerId).toBeNull();
    expect(unwrap(await owners.listOwners(session, residence.id))).toEqual([]);
  });

  it("rejects lots from another residence", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const other = await residenceWithOpenCycle();
    const result = await owners.createOwner(session, residence.id, { name: "X", lotIds: [other.lots.a11.id] });
    expect(result.ok).toBe(false);
  });

  it("records the owner on a payment and snapshots their name", async () => {
    const { session, residence, cycle, lots: l, assessmentOf } = await residenceWithOpenCycle();
    const owner = unwrap(await owners.createOwner(session, residence.id, { name: "Payer Owner", lotIds: [l.a11.id] }));
    const payment = unwrap(
      await payments.recordPayment(session, residence.id, {
        ownerId: owner.id,
        payerName: "ignored when an owner is given",
        date: "2026-03-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: assessmentOf("A11"), amountMillimes: "1000" }],
      }),
    );
    expect(payment).toMatchObject({ ownerId: owner.id, payerName: "Payer Owner" });
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))[0].ownerId).toBe(owner.id);
  });

  it("is scoped to the residence", async () => {
    const { residence } = await residenceWithOpenCycle();
    await expect(owners.listOwners(adminSession(newUserId()), residence.id)).rejects.toThrow();
  });

  it("takes the payer from the units paid: their owner, or the owners' names", async () => {
    const { session, residence, cycle, lots: l, assessmentOf } = await residenceWithOpenCycle();
    const one = unwrap(await owners.createOwner(session, residence.id, { name: "First Owner", lotIds: [l.a11.id, l.a12.id] }));
    unwrap(await owners.createOwner(session, residence.id, { name: "Second Owner", lotIds: [l.b11.id] }));
    const pay = (codes: string[]) =>
      payments.recordPayment(session, residence.id, {
        date: "2026-03-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: codes.map((c) => ({ assessmentId: assessmentOf(c), amountMillimes: "1" })),
      });

    expect(unwrap(await pay(["A11", "A12"]))).toMatchObject({ ownerId: one.id, payerName: "First Owner" });
    expect(unwrap(await pay(["A11", "B11"]))).toMatchObject({ ownerId: null, payerName: "First Owner, Second Owner" });
    unwrap(await owners.deleteOwner(session, residence.id, one.id));
    expect(unwrap(await pay(["A12"]))).toMatchObject({ ownerId: null, payerName: null });
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))).toHaveLength(3);
  });
});
