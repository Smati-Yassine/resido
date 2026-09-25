import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Assessment, AssessmentCalculationMethod, AssessmentStatus } from "./schema";

interface AssessmentDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  cycleId: ObjectId;
  lotId: ObjectId;
  ownerId?: ObjectId | null;
  amountMillimes: number;
  calculationMethod: AssessmentCalculationMethod;
  calculationInputs?: Record<string, unknown>;
  dueDate: Date;
  status: AssessmentStatus;
  paidMillimes: number;
  notes?: string;
}

function toDomain(doc: AssessmentDoc): Assessment {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    cycleId: fromObjectId(doc.cycleId),
    lotId: fromObjectId(doc.lotId),
    ownerId: doc.ownerId === undefined ? undefined : doc.ownerId ? fromObjectId(doc.ownerId) : null,
    amountMillimes: doc.amountMillimes,
    calculationMethod: doc.calculationMethod,
    calculationInputs: doc.calculationInputs,
    dueDate: doc.dueDate,
    status: doc.status,
    paidMillimes: doc.paidMillimes,
    notes: doc.notes,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<AssessmentDoc>(COLLECTIONS.assessments);
}

export interface InsertAssessmentInput {
  lotId: string;
  ownerId: string | null;
  amountMillimes: number;
  calculationMethod: AssessmentCalculationMethod;
  calculationInputs?: Record<string, unknown>;
  dueDate: Date;
}

export async function insertAssessments(
  organizationId: string,
  cycleId: string,
  inputs: InsertAssessmentInput[],
  session: ClientSession,
): Promise<Assessment[]> {
  if (inputs.length === 0) return [];
  const docs: AssessmentDoc[] = inputs.map((input) => ({
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    cycleId: toObjectId(cycleId),
    lotId: toObjectId(input.lotId),
    ownerId: input.ownerId ? toObjectId(input.ownerId) : null,
    amountMillimes: input.amountMillimes,
    calculationMethod: input.calculationMethod,
    calculationInputs: input.calculationInputs,
    dueDate: input.dueDate,
    status: "PENDING",
    paidMillimes: 0,
  }));
  await (await collection()).insertMany(docs, { session });
  return docs.map(toDomain);
}

export async function listAssessmentsForCycle(organizationId: string, cycleId: string): Promise<Assessment[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId), cycleId: toObjectId(cycleId) })
    .toArray();
  return docs.map(toDomain);
}

export async function listAssessmentsForLot(organizationId: string, lotId: string): Promise<Assessment[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId), lotId: toObjectId(lotId) })
    .sort({ dueDate: -1 })
    .toArray();
  return docs.map(toDomain);
}

export async function findAssessment(
  organizationId: string,
  cycleId: string,
  lotId: string,
): Promise<Assessment | null> {
  const doc = await (
    await collection()
  ).findOne({ organizationId: toObjectId(organizationId), cycleId: toObjectId(cycleId), lotId: toObjectId(lotId) });
  return doc ? toDomain(doc) : null;
}

export async function findAssessmentById(organizationId: string, id: string): Promise<Assessment | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

const STATUS_FROM_PAID_PIPELINE_STAGE = {
  $set: {
    status: {
      $switch: {
        branches: [
          { case: { $lte: ["$paidMillimes", 0] }, then: "PENDING" },
          { case: { $gte: ["$paidMillimes", "$amountMillimes"] }, then: "PAID" },
        ],
        default: "PARTIALLY_PAID",
      },
    },
  },
};

export class OverAllocationError extends Error {}

/**
 * Atomically increments paidMillimes and recomputes status in one
 * findOneAndUpdate, using an aggregation-pipeline update so the new status
 * is derived from the document's own post-increment fields with no
 * read-then-write race. The $expr match clause additionally rejects the
 * write server-side if it would overpay the assessment, closing the race
 * window between a pre-check read and this write under concurrent payments.
 * See docs/03-mongodb-architecture.md #transaction-strategy.
 */
export async function applyPaymentToAssessment(
  organizationId: string,
  assessmentId: string,
  amountMillimes: number,
  session: ClientSession,
): Promise<Assessment> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    {
      _id: toObjectId(assessmentId),
      organizationId: toObjectId(organizationId),
      status: { $ne: "CANCELLED" },
      $expr: { $lte: [{ $add: ["$paidMillimes", amountMillimes] }, "$amountMillimes"] },
    },
    [{ $set: { paidMillimes: { $add: ["$paidMillimes", amountMillimes] } } }, STATUS_FROM_PAID_PIPELINE_STAGE],
    { returnDocument: "after", session },
  );
  if (!result) {
    throw new OverAllocationError(
      `Allocation of ${amountMillimes} millimes would exceed the assessment's remaining balance`,
    );
  }
  return toDomain(result);
}

/** Reverses a previously-applied allocation (cancel/reverse a payment). */
export async function reversePaymentFromAssessment(
  organizationId: string,
  assessmentId: string,
  amountMillimes: number,
  session: ClientSession,
): Promise<Assessment | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(assessmentId), organizationId: toObjectId(organizationId) },
    [
      { $set: { paidMillimes: { $max: [0, { $subtract: ["$paidMillimes", amountMillimes] }] } } },
      STATUS_FROM_PAID_PIPELINE_STAGE,
    ],
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

export interface CycleAssessmentSummary {
  totalAmountMillimes: number;
  totalPaidMillimes: number;
  countByStatus: Record<AssessmentStatus, number>;
}

export async function summarizeAssessmentsForCycle(
  organizationId: string,
  cycleId: string,
): Promise<CycleAssessmentSummary> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId), cycleId: toObjectId(cycleId) })
    .toArray();

  const summary: CycleAssessmentSummary = {
    totalAmountMillimes: 0,
    totalPaidMillimes: 0,
    countByStatus: { PENDING: 0, PARTIALLY_PAID: 0, PAID: 0, CANCELLED: 0 },
  };
  for (const doc of docs) {
    summary.totalAmountMillimes += doc.amountMillimes;
    summary.totalPaidMillimes += doc.paidMillimes;
    summary.countByStatus[doc.status] += 1;
  }
  return summary;
}

/**
 * Changes what an assessment bills (a lot's charge corrected mid-cycle) and
 * recomputes its status. Refused (null) if it would drop below what is
 * already paid.
 */
export async function setAssessmentAmount(
  organizationId: string,
  assessmentId: string,
  amountMillimes: number,
  session: ClientSession,
): Promise<Assessment | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    {
      _id: toObjectId(assessmentId),
      organizationId: toObjectId(organizationId),
      paidMillimes: { $lte: amountMillimes },
    },
    [{ $set: { amountMillimes } }, STATUS_FROM_PAID_PIPELINE_STAGE],
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

export async function deleteAssessment(
  organizationId: string,
  assessmentId: string,
  session: ClientSession,
): Promise<void> {
  await (
    await collection()
  ).deleteOne({ _id: toObjectId(assessmentId), organizationId: toObjectId(organizationId) }, { session });
}

/**
 * Pins the lot's legacy assessments (no ownerId yet) to `ownerId` — the
 * owner they have implicitly followed so far — before its ownership changes.
 */
export async function pinLegacyOwner(
  organizationId: string,
  lotId: string,
  ownerId: string | null,
  session: ClientSession,
): Promise<void> {
  await (
    await collection()
  ).updateMany(
    { organizationId: toObjectId(organizationId), lotId: toObjectId(lotId), ownerId: { $exists: false } },
    { $set: { ownerId: ownerId ? toObjectId(ownerId) : null } },
    { session },
  );
}

export async function setAssessmentsOwner(
  organizationId: string,
  assessmentIds: string[],
  ownerId: string | null,
  session: ClientSession,
): Promise<void> {
  if (assessmentIds.length === 0) return;
  await (
    await collection()
  ).updateMany(
    { organizationId: toObjectId(organizationId), _id: { $in: assessmentIds.map(toObjectId) } },
    { $set: { ownerId: ownerId ? toObjectId(ownerId) : null } },
    { session },
  );
}

/** A deleted owner leaves every cycle: their lots' assessments keep no owner. */
export async function clearOwnerEverywhere(
  organizationId: string,
  ownerId: string,
  session: ClientSession,
): Promise<void> {
  await (
    await collection()
  ).updateMany(
    { organizationId: toObjectId(organizationId), ownerId: toObjectId(ownerId) },
    { $set: { ownerId: null } },
    { session },
  );
}
