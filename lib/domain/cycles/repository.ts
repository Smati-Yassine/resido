import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Cycle, CycleStatus, OpeningSource } from "./schema";

interface CycleDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date | null;
  status: CycleStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  createdBy: ObjectId;
  closedBy: ObjectId | null;
  openingTreasuryBalanceMillimes: number | null;
  openingSource?: OpeningSource;
  closingTreasuryBalanceMillimes: number | null;
  previousCycleId: ObjectId | null;
  nextCycleId: ObjectId | null;
}

function toDomain(doc: CycleDoc): Cycle {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    name: doc.name,
    startDate: doc.startDate,
    endDate: doc.endDate ?? null,
    status: doc.status,
    openedAt: doc.openedAt,
    closedAt: doc.closedAt,
    createdBy: fromObjectId(doc.createdBy),
    closedBy: doc.closedBy ? fromObjectId(doc.closedBy) : null,
    openingTreasuryBalanceMillimes: doc.openingTreasuryBalanceMillimes,
    openingSource: doc.openingSource,
    closingTreasuryBalanceMillimes: doc.closingTreasuryBalanceMillimes,
    previousCycleId: doc.previousCycleId ? fromObjectId(doc.previousCycleId) : null,
    nextCycleId: doc.nextCycleId ? fromObjectId(doc.nextCycleId) : null,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<CycleDoc>(COLLECTIONS.cycles);
}

export class AnotherCycleOpenError extends Error {}

export async function insertDraftCycle(
  organizationId: string,
  input: { name: string; startDate: Date; endDate: Date | null; createdBy: string; previousCycleId: string | null },
): Promise<Cycle> {
  const doc: CycleDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "DRAFT",
    openedAt: null,
    closedAt: null,
    createdBy: toObjectId(input.createdBy),
    closedBy: null,
    openingTreasuryBalanceMillimes: null,
    closingTreasuryBalanceMillimes: null,
    previousCycleId: input.previousCycleId ? toObjectId(input.previousCycleId) : null,
    nextCycleId: null,
  };
  await (await collection()).insertOne(doc);
  return toDomain(doc);
}

export async function findCycleById(organizationId: string, id: string): Promise<Cycle | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

export async function findOpenCycle(organizationId: string): Promise<Cycle | null> {
  const doc = await (await collection()).findOne({ organizationId: toObjectId(organizationId), status: "OPEN" });
  return doc ? toDomain(doc) : null;
}

export async function listCycles(organizationId: string): Promise<Cycle[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId) })
    .sort({ startDate: -1 })
    .toArray();
  return docs.map(toDomain);
}

export async function markCycleOpen(
  organizationId: string,
  cycleId: string,
  input: { openedAt: Date; openingTreasuryBalanceMillimes: number; openingSource: OpeningSource },
  session: ClientSession,
): Promise<Cycle | null> {
  try {
    const result = await (
      await collection()
    ).findOneAndUpdate(
      { _id: toObjectId(cycleId), organizationId: toObjectId(organizationId), status: "DRAFT" },
      {
        $set: {
          status: "OPEN",
          openedAt: input.openedAt,
          openingTreasuryBalanceMillimes: input.openingTreasuryBalanceMillimes,
          openingSource: input.openingSource,
        },
      },
      { returnDocument: "after", session },
    );
    return result ? toDomain(result) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AnotherCycleOpenError("Another cycle is already OPEN for this organization");
    }
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000;
}

export async function markCycleClosed(
  organizationId: string,
  cycleId: string,
  closedBy: string,
  closedAt: Date,
  closingTreasuryBalanceMillimes: number,
  session: ClientSession,
): Promise<Cycle | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(cycleId), organizationId: toObjectId(organizationId), status: "OPEN" },
    [
      {
        $set: {
          status: "CLOSED",
          closedAt,
          closedBy: toObjectId(closedBy),
          closingTreasuryBalanceMillimes,
          // An open-ended cycle ends the day it is closed.
          endDate: { $ifNull: ["$endDate", closedAt] },
        },
      },
    ],
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

export async function linkNextCycle(
  organizationId: string,
  previousCycleId: string,
  nextCycleId: string,
): Promise<void> {
  await (
    await collection()
  ).updateOne(
    { _id: toObjectId(previousCycleId), organizationId: toObjectId(organizationId) },
    { $set: { nextCycleId: toObjectId(nextCycleId) } },
  );
}

/**
 * Sets where a billed (OPEN or CLOSED) cycle's starting balance comes from:
 * a typed-in amount, or — CARRIED — the previous cycle's closing balance.
 */
export async function setOpeningBalance(
  organizationId: string,
  cycleId: string,
  opening: { source: "MANUAL"; amountMillimes: number } | { source: "CARRIED" },
): Promise<Cycle | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(cycleId), organizationId: toObjectId(organizationId), status: { $in: ["OPEN", "CLOSED"] } },
    {
      $set:
        opening.source === "MANUAL"
          ? { openingSource: "MANUAL", openingTreasuryBalanceMillimes: opening.amountMillimes }
          : { openingSource: "CARRIED" },
    },
    { returnDocument: "after" },
  );
  return result ? toDomain(result) : null;
}

/**
 * Deletes a cycle with everything billed, paid and spent in it, and splices
 * it out of the previous/next chain. Payments are only ever recorded on one
 * (the open) cycle, so every payment touching this cycle belongs to it alone.
 */
export async function deleteCycleCascade(organizationId: string, cycle: Cycle, session: ClientSession): Promise<void> {
  const db = await getDb();
  const org = toObjectId(organizationId);
  const id = toObjectId(cycle.id);
  await db.collection(COLLECTIONS.assessments).deleteMany({ organizationId: org, cycleId: id }, { session });
  await db.collection(COLLECTIONS.payments).deleteMany({ organizationId: org, "allocations.cycleId": id }, { session });
  await db.collection(COLLECTIONS.expenses).deleteMany({ organizationId: org, cycleId: id }, { session });
  const cycles = await collection();
  await cycles.deleteOne({ _id: id, organizationId: org }, { session });
  // Repoint every link to the deleted cycle (not just its two recorded
  // neighbours) so no cycle is left referencing it.
  await cycles.updateMany(
    { organizationId: org, previousCycleId: id },
    { $set: { previousCycleId: cycle.previousCycleId ? toObjectId(cycle.previousCycleId) : null } },
    { session },
  );
  await cycles.updateMany(
    { organizationId: org, nextCycleId: id },
    { $set: { nextCycleId: cycle.nextCycleId ? toObjectId(cycle.nextCycleId) : null } },
    { session },
  );
}
