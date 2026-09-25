import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Payment, PaymentAllocation, PaymentMethod, PaymentStatus } from "./schema";

interface PaymentDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  ownerId?: ObjectId | null;
  payerName: string | null;
  date: Date;
  amountMillimes: number;
  method: PaymentMethod;
  note: string | null;
  status: PaymentStatus;
  cancelledReason: string | null;
  idempotencyKey: string;
  allocations: { assessmentId: ObjectId; lotId: ObjectId; cycleId: ObjectId; amountMillimes: number }[];
  createdBy: ObjectId;
}

function toDomain(doc: PaymentDoc): Payment {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    ownerId: doc.ownerId ? fromObjectId(doc.ownerId) : null,
    payerName: doc.payerName ?? null,
    date: doc.date,
    amountMillimes: doc.amountMillimes,
    method: doc.method,
    note: doc.note ?? null,
    status: doc.status,
    cancelledReason: doc.cancelledReason,
    idempotencyKey: doc.idempotencyKey,
    allocations: doc.allocations.map((a): PaymentAllocation => ({
      assessmentId: fromObjectId(a.assessmentId),
      lotId: fromObjectId(a.lotId),
      cycleId: fromObjectId(a.cycleId),
      amountMillimes: a.amountMillimes,
    })),
    createdBy: fromObjectId(doc.createdBy),
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<PaymentDoc>(COLLECTIONS.payments);
}

export class DuplicateIdempotencyKeyError extends Error {}

export interface InsertPaymentInput {
  ownerId: string | null;
  payerName: string | null;
  date: Date;
  amountMillimes: number;
  method: PaymentMethod;
  note: string | null;
  idempotencyKey: string;
  allocations: PaymentAllocation[];
  createdBy: string;
}

export async function insertPayment(
  organizationId: string,
  input: InsertPaymentInput,
  session: ClientSession,
): Promise<Payment> {
  const doc: PaymentDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    ownerId: input.ownerId ? toObjectId(input.ownerId) : null,
    payerName: input.payerName,
    date: input.date,
    amountMillimes: input.amountMillimes,
    method: input.method,
    note: input.note,
    status: "COMPLETED",
    cancelledReason: null,
    idempotencyKey: input.idempotencyKey,
    allocations: input.allocations.map((a) => ({
      assessmentId: toObjectId(a.assessmentId),
      lotId: toObjectId(a.lotId),
      cycleId: toObjectId(a.cycleId),
      amountMillimes: a.amountMillimes,
    })),
    createdBy: toObjectId(input.createdBy),
  };
  try {
    await (await collection()).insertOne(doc, { session });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new DuplicateIdempotencyKeyError("A payment with this idempotency key already exists");
    }
    throw error;
  }
  return toDomain(doc);
}

export async function findPaymentByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): Promise<Payment | null> {
  const doc = await (await collection()).findOne({ organizationId: toObjectId(organizationId), idempotencyKey });
  return doc ? toDomain(doc) : null;
}

export async function findPaymentById(organizationId: string, id: string): Promise<Payment | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

/** COMPLETED payments with at least one allocation in the cycle, newest first. */
export async function listPaymentsForCycle(organizationId: string, cycleId: string): Promise<Payment[]> {
  const docs = await (
    await collection()
  )
    .find({
      organizationId: toObjectId(organizationId),
      status: "COMPLETED",
      "allocations.cycleId": toObjectId(cycleId),
    })
    .sort({ date: -1, _id: -1 })
    .toArray();
  return docs.map(toDomain);
}

export async function markPaymentVoided(
  organizationId: string,
  paymentId: string,
  status: "CANCELLED" | "REVERSED",
  reason: string,
  session: ClientSession,
): Promise<Payment | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(paymentId), organizationId: toObjectId(organizationId), status: "COMPLETED" },
    { $set: { status, cancelledReason: reason } },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

/**
 * Sums the portion of COMPLETED payments allocated to assessments in a given
 * cycle — the "Recette" side of the cycle's treasury (docs/01-excel-analysis.md
 * Sheet5). Uses allocation amounts, not whole-payment amounts, so a payment
 * spanning multiple cycles attributes correctly to each.
 */
export async function sumCompletedPaymentsForCycle(organizationId: string, cycleId: string): Promise<number> {
  const cycleObjectId = toObjectId(cycleId);
  const result = await (
    await collection()
  )
    .aggregate<{ total: number }>([
      {
        $match: {
          organizationId: toObjectId(organizationId),
          status: "COMPLETED",
          "allocations.cycleId": cycleObjectId,
        },
      },
      { $unwind: "$allocations" },
      { $match: { "allocations.cycleId": cycleObjectId } },
      { $group: { _id: null, total: { $sum: "$allocations.amountMillimes" } } },
    ])
    .toArray();
  return result[0]?.total ?? 0;
}

/** Rewrites a COMPLETED payment's content (edit). Null if it is no longer COMPLETED. */
export async function replacePaymentContent(
  organizationId: string,
  paymentId: string,
  input: Omit<InsertPaymentInput, "idempotencyKey" | "createdBy">,
  session: ClientSession,
): Promise<Payment | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(paymentId), organizationId: toObjectId(organizationId), status: "COMPLETED" },
    {
      $set: {
        ownerId: input.ownerId ? toObjectId(input.ownerId) : null,
        payerName: input.payerName,
        date: input.date,
        amountMillimes: input.amountMillimes,
        method: input.method,
        note: input.note,
        allocations: input.allocations.map((a) => ({
          assessmentId: toObjectId(a.assessmentId),
          lotId: toObjectId(a.lotId),
          cycleId: toObjectId(a.cycleId),
          amountMillimes: a.amountMillimes,
        })),
      },
    },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}
