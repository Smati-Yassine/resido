import { describe, expect, it } from "vitest";
import * as owners from "@/lib/domain/owners/service";
import * as lots from "@/lib/domain/lots/service";
import * as payments from "@/lib/domain/payments/service";
import * as overview from "@/lib/domain/overview/service";
import * as cycles from "@/lib/domain/cycles/service";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
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
    expect(rows.filter((r) => r.ownerIds.includes(owner.id)).map((r) => [r.code, r.ownerName])).toEqual([
      ["A11", "Owner One"],
      ["B11", "Owner One"],
    ]);
    expect(rows.find((r) => r.code === "A12")?.ownerIds).toEqual([]);
  });

  it("moves a lot from one owner to another, and editing replaces the owner's lots", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const first = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "First",
        lotIds: [l.a11.id, l.a12.id],
      }),
    );
    const second = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "Second",
        lotIds: [l.a12.id],
      }),
    );

    let rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.find((r) => r.code === "A12")?.ownerIds).toEqual([second.id]);

    unwrap(
      await owners.updateOwner(session, residence.id, first.id, {
        name: "First renamed",
        lotIds: [l.b11.id],
      }),
    );
    rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.map((r) => [r.code, r.ownerName])).toEqual([
      ["A11", null],
      ["A12", "Second"],
      ["B11", "First renamed"],
    ]);
  });

  it("assigns an owner from the lot side, and deleting the owner frees their lots", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const owner = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "Owner",
        lotIds: [],
      }),
    );
    unwrap(
      await lots.updateLot(session, residence.id, {
        lotId: l.a11.id,
        buildingId: l.a11.buildingId!,
        code: "A11",
        chargeMillimes: "1000",
        ownerIds: [owner.id],
      }),
    );
    expect((await overview.getLotRows(session, residence.id, cycle.id))[0].ownerName).toBe("Owner");

    unwrap(await owners.deleteOwner(session, residence.id, owner.id));
    expect((await overview.getLotRows(session, residence.id, cycle.id))[0].ownerIds).toEqual([]);
    expect(unwrap(await owners.listOwners(session, residence.id))).toEqual([]);
  });

  it("rejects lots from another residence", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const other = await residenceWithOpenCycle();
    const result = await owners.createOwner(session, residence.id, {
      name: "X",
      lotIds: [other.lots.a11.id],
    });
    expect(result.ok).toBe(false);
  });

  it("records the owner on a payment and snapshots their name", async () => {
    const { session, residence, cycle, lots: l, assessmentOf } = await residenceWithOpenCycle();
    const owner = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "Payer Owner",
        lotIds: [l.a11.id],
      }),
    );
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
    expect(payment).toMatchObject({
      ownerId: owner.id,
      payerName: "Payer Owner",
    });
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))[0].ownerId).toBe(owner.id);
  });

  it("is scoped to the residence", async () => {
    const { residence } = await residenceWithOpenCycle();
    await expect(owners.listOwners(adminSession(newUserId()), residence.id)).rejects.toThrow();
  });

  it("takes the payer from the units paid: their owner, or the owners' names", async () => {
    const { session, residence, cycle, lots: l, assessmentOf } = await residenceWithOpenCycle();
    const one = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "First Owner",
        lotIds: [l.a11.id, l.a12.id],
      }),
    );
    unwrap(
      await owners.createOwner(session, residence.id, {
        name: "Second Owner",
        lotIds: [l.b11.id],
      }),
    );
    const pay = (codes: string[]) =>
      payments.recordPayment(session, residence.id, {
        date: "2026-03-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: codes.map((c) => ({
          assessmentId: assessmentOf(c),
          amountMillimes: "1",
        })),
      });

    expect(unwrap(await pay(["A11", "A12"]))).toMatchObject({
      ownerId: one.id,
      payerName: "First Owner",
    });
    expect(unwrap(await pay(["A11", "B11"]))).toMatchObject({
      ownerId: null,
      payerName: "First Owner, Second Owner",
    });
    unwrap(await owners.deleteOwner(session, residence.id, one.id));
    expect(unwrap(await pay(["A12"]))).toMatchObject({
      ownerId: null,
      payerName: null,
    });
    expect(unwrap(await payments.listPaymentsForCycle(session, residence.id, cycle.id))).toHaveLength(3);
  });
});

describe("ownership per cycle", () => {
  /** 2026 with A11 owned by A, closed; then 2027 open (it bills A11 to A too). */
  async function twoCycles() {
    const ctx = await residenceWithOpenCycle();
    const { session, residence, lots: l } = ctx;
    const a = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "A",
        lotIds: [l.a11.id],
      }),
    );
    unwrap(await cycles.closeCycle(session, residence.id, { cycleId: ctx.cycle.id }));
    const draft = unwrap(
      await cycles.createCycle(session, residence.id, {
        name: "2027",
        startDate: "2027-01-01",
      }),
    );
    const next = unwrap(await cycles.openCycle(session, residence.id, { cycleId: draft.id }));
    const ownerIn = async (cycleId: string) =>
      (await overview.getLotRows(session, residence.id, cycleId)).find((r) => r.code === "A11")!.ownerName;
    const setOwner = (ownerId: string | null, cycleId: string) =>
      lots.updateLot(
        session,
        residence.id,
        {
          lotId: l.a11.id,
          buildingId: l.a11.buildingId!,
          code: "A11",
          chargeMillimes: "1000",
          ownerIds: ownerId ? [ownerId] : [],
        },
        cycleId,
      );
    return { ...ctx, a, next, ownerIn, setOwner };
  }

  it("a sale recorded in the new cycle leaves the old cycle with its owner", async () => {
    const { session, residence, cycle, next, ownerIn, setOwner, lots: l } = await twoCycles();
    const b = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "B",
        lotIds: [],
      }),
    );
    unwrap(await setOwner(b.id, next.id));
    expect(await ownerIn(cycle.id)).toBe("A");
    expect(await ownerIn(next.id)).toBe("B");
    // Cycles still to open start with B.
    expect(unwrap(await lots.listLots(session, residence.id)).find((x) => x.id === l.a11.id)!.ownerIds).toEqual([b.id]);
  });

  it("correcting an old cycle carries forward only while the owner was the same", async () => {
    const { session, residence, cycle, next, ownerIn, setOwner } = await twoCycles();
    const c = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "C",
        lotIds: [],
      }),
    );
    // 2027 still had A: the correction reaches it.
    unwrap(await setOwner(c.id, cycle.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["C", "C"]);

    // 2027 now differs (D): a new 2026 correction stops at 2026.
    const d = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "D",
        lotIds: [],
      }),
    );
    unwrap(await setOwner(d.id, next.id));
    unwrap(await setOwner(null, cycle.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual([null, "D"]);
  });

  it("the owner form assigns units in the cycle being viewed", async () => {
    const { session, residence, cycle, next, ownerIn, lots: l } = await twoCycles();
    unwrap(await owners.createOwner(session, residence.id, { name: "B", lotIds: [l.a11.id] }, next.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", "B"]);
  });

  it("a payment in the old cycle is paid by that cycle's owner", async () => {
    const { session, residence, cycle, next, setOwner } = await twoCycles();
    const b = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "B",
        lotIds: [],
      }),
    );
    unwrap(await setOwner(b.id, next.id));
    const row = (await overview.getLotRows(session, residence.id, cycle.id)).find((r) => r.code === "A11")!;
    const payment = unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-12-30",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [{ assessmentId: row.assessmentId, amountMillimes: "10" }],
      }),
    );
    expect(payment.payerName).toBe("A");
  });

  it("charges built before owners were kept per cycle keep their owner when it changes", async () => {
    const { session, residence, cycle, next, ownerIn, setOwner } = await twoCycles();
    // Simulate old data: no owner recorded on the charges.
    await (await getDb()).collection(COLLECTIONS.assessments).updateMany({}, { $unset: { ownerIds: "", ownerId: "" } });
    expect(await ownerIn(cycle.id)).toBe("A");
    const b = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "B",
        lotIds: [],
      }),
    );
    unwrap(await setOwner(b.id, next.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", "B"]);
  });

  it("removing an owner in the new cycle keeps them in the old one", async () => {
    const { session, residence, cycle, next, ownerIn, setOwner, a } = await twoCycles();
    const b = unwrap(await owners.createOwner(session, residence.id, { name: "B", lotIds: [] }));
    unwrap(await setOwner(b.id, next.id));
    // A owns A11 in 2026 only; removed while viewing 2027.
    unwrap(await owners.deleteOwner(session, residence.id, a.id, next.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", "B"]);
    // Kept for 2026's history, flagged as removed from the present.
    const kept = unwrap(await owners.listOwners(session, residence.id)).find((o) => o.id === a.id);
    expect(kept).toMatchObject({ name: "A", removed: true });
  });

  it("removing an owner from a cycle clears that cycle and the later ones", async () => {
    const { session, residence, cycle, next, ownerIn, a, lots: l } = await twoCycles();
    unwrap(await owners.deleteOwner(session, residence.id, a.id, next.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", null]);
    expect(unwrap(await lots.listLots(session, residence.id)).find((x) => x.id === l.a11.id)!.ownerIds).toEqual([]);
  });

  it("an owner no cycle names any more is deleted for good", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const o = unwrap(await owners.createOwner(session, residence.id, { name: "Temp", lotIds: [] }));
    unwrap(await owners.deleteOwner(session, residence.id, o.id));
    expect(unwrap(await owners.listOwners(session, residence.id)).some((x) => x.id === o.id)).toBe(false);
  });

  it("reads records from before co-ownership: one ownerId on the lot and the charges", async () => {
    const { session, residence, cycle, next, ownerIn, setOwner, lots: l } = await twoCycles();
    const db = await getDb();
    // Old shape: a single ownerId field, no ownerIds.
    await db
      .collection(COLLECTIONS.assessments)
      .updateMany({}, [{ $set: { ownerId: { $arrayElemAt: ["$ownerIds", 0] } } }, { $unset: "ownerIds" }]);
    await db
      .collection(COLLECTIONS.lots)
      .updateMany({}, [{ $set: { ownerId: { $arrayElemAt: ["$ownerIds", 0] } } }, { $unset: "ownerIds" }]);
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", "A"]);
    const b = unwrap(await owners.createOwner(session, residence.id, { name: "B", lotIds: [] }));
    unwrap(await setOwner(b.id, next.id));
    expect([await ownerIn(cycle.id), await ownerIn(next.id)]).toEqual(["A", "B"]);
    expect(unwrap(await lots.listLots(session, residence.id)).find((x) => x.id === l.a11.id)!.ownerIds).toEqual([b.id]);
  });
});

describe("co-ownership", () => {
  it("the owner form shares a lot (both own it) or hands it over", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const a = unwrap(await owners.createOwner(session, residence.id, { name: "A", lotIds: [l.a11.id, l.a12.id] }));
    // B shares A11 with A, and takes A12 over.
    const b = unwrap(
      await owners.createOwner(session, residence.id, {
        name: "B",
        lotIds: [l.a11.id, l.a12.id],
        shareLotIds: [l.a11.id],
      }),
    );
    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    const row = (code: string) => rows.find((r) => r.code === code)!;
    expect(row("A11")).toMatchObject({ ownerIds: [a.id, b.id], ownerName: "A & B" });
    expect(row("A12")).toMatchObject({ ownerIds: [b.id], ownerName: "B" });

    // Taking B off A11 leaves A its owner.
    unwrap(await owners.updateOwner(session, residence.id, b.id, { name: "B", lotIds: [l.a12.id] }));
    const after = await overview.getLotRows(session, residence.id, cycle.id);
    expect(after.find((r) => r.code === "A11")).toMatchObject({ ownerIds: [a.id], ownerName: "A" });
  });

  it("a lot can be given several owners from its form, and removing one keeps the other", async () => {
    const { session, residence, cycle, lots: l } = await residenceWithOpenCycle();
    const a = unwrap(await owners.createOwner(session, residence.id, { name: "A", lotIds: [] }));
    const b = unwrap(await owners.createOwner(session, residence.id, { name: "B", lotIds: [] }));
    unwrap(
      await lots.updateLot(session, residence.id, {
        lotId: l.a11.id,
        buildingId: l.a11.buildingId!,
        code: "A11",
        chargeMillimes: "1000",
        ownerIds: [a.id, b.id],
      }),
    );
    const payment = unwrap(
      await payments.recordPayment(session, residence.id, {
        date: "2026-02-01",
        method: "CASH",
        idempotencyKey: key(),
        allocations: [
          {
            assessmentId: (await overview.getLotRows(session, residence.id, cycle.id)).find((r) => r.code === "A11")!
              .assessmentId,
            amountMillimes: "10",
          },
        ],
      }),
    );
    // Co-owners paying together: no single owner, both names.
    expect(payment).toMatchObject({ ownerId: null, payerName: "A, B" });

    unwrap(await owners.deleteOwner(session, residence.id, a.id));
    const rows = await overview.getLotRows(session, residence.id, cycle.id);
    expect(rows.find((r) => r.code === "A11")).toMatchObject({ ownerIds: [b.id], ownerName: "B" });
  });
});
