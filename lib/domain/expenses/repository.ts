import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Expense, ExpenseStatus } from "./schema";

interface ExpenseDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  cycleId: ObjectId;
  label: string;
  amountMillimes: number;
  reference: string | null;
  date: Date;
  status: ExpenseStatus;
  cancelledReason: string | null;
  idempotencyKey: string;
  createdBy: ObjectId;
}

function toDomain(doc: ExpenseDoc): Expense {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    cycleId: fromObjectId(doc.cycleId),
    label: doc.label,
    amountMillimes: doc.amountMillimes,
    reference: doc.reference ?? null,
    date: doc.date,
    status: doc.status,
    cancelledReason: doc.cancelledReason,
    idempotencyKey: doc.idempotencyKey,
    createdBy: fromObjectId(doc.createdBy),
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<ExpenseDoc>(COLLECTIONS.expenses);
}

export class DuplicateIdempotencyKeyError extends Error {}

export interface InsertExpenseInput {
  cycleId: string;
  label: string;
  amountMillimes: number;
  reference: string | null;
  date: Date;
  idempotencyKey: string;
  createdBy: string;
}

export async function insertExpense(
  organizationId: string,
  input: InsertExpenseInput,
  session: ClientSession,
): Promise<Expense> {
  const doc: ExpenseDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    cycleId: toObjectId(input.cycleId),
    label: input.label,
    amountMillimes: input.amountMillimes,
    reference: input.reference,
    date: input.date,
    status: "RECORDED",
    cancelledReason: null,
    idempotencyKey: input.idempotencyKey,
    createdBy: toObjectId(input.createdBy),
  };
  try {
    await (await collection()).insertOne(doc, { session });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new DuplicateIdempotencyKeyError("An expense with this idempotency key already exists");
    }
    throw error;
  }
  return toDomain(doc);
}

export async function findExpenseByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): Promise<Expense | null> {
  const doc = await (await collection()).findOne({ organizationId: toObjectId(organizationId), idempotencyKey });
  return doc ? toDomain(doc) : null;
}

export async function findExpenseById(organizationId: string, id: string): Promise<Expense | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

/** RECORDED expenses of a cycle in chronological order (the order of the source ledger). */
export async function listExpensesForCycle(organizationId: string, cycleId: string): Promise<Expense[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId), cycleId: toObjectId(cycleId), status: "RECORDED" })
    .sort({ date: 1, _id: 1 })
    .toArray();
  return docs.map(toDomain);
}

export async function markExpenseVoided(
  organizationId: string,
  expenseId: string,
  status: "CANCELLED" | "REVERSED",
  reason: string,
  session: ClientSession,
): Promise<Expense | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(expenseId), organizationId: toObjectId(organizationId), status: "RECORDED" },
    { $set: { status, cancelledReason: reason } },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

/** RECORDED expenses summed per cycle, for every cycle of the residence at once. */
export async function sumRecordedExpensesByCycle(organizationId: string): Promise<Map<string, number>> {
  const result = await (
    await collection()
  )
    .aggregate<{ _id: ObjectId; total: number }>([
      { $match: { organizationId: toObjectId(organizationId), status: "RECORDED" } },
      { $group: { _id: "$cycleId", total: { $sum: "$amountMillimes" } } },
    ])
    .toArray();
  return new Map(result.map((r) => [fromObjectId(r._id), r.total]));
}

/** Rewrites a RECORDED expense (edit). Null if it is no longer RECORDED. */
export async function replaceExpenseContent(
  organizationId: string,
  expenseId: string,
  input: { label: string; amountMillimes: number; reference: string | null; date: Date },
  session: ClientSession,
): Promise<Expense | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(expenseId), organizationId: toObjectId(organizationId), status: "RECORDED" },
    { $set: input },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}
