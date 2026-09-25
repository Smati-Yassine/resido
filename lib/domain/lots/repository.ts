import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import { newTimestamps } from "@/lib/db/timestamps";
import type { Lot } from "./schema";

interface LotDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  buildingId: ObjectId | null;
  ownerId?: ObjectId | null;
  code: string;
  chargeMillimes: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(doc: LotDoc): Lot {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    buildingId: doc.buildingId ? fromObjectId(doc.buildingId) : null,
    ownerId: doc.ownerId ? fromObjectId(doc.ownerId) : null,
    code: doc.code,
    chargeMillimes: doc.chargeMillimes ?? 0,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<LotDoc>(COLLECTIONS.lots);
}

export class DuplicateLotCodeError extends Error {}

export interface InsertLotInput {
  buildingId: string | null;
  ownerId: string | null;
  code: string;
  chargeMillimes: number;
}

export async function insertLot(organizationId: string, input: InsertLotInput, session?: ClientSession): Promise<Lot> {
  const doc: LotDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    buildingId: input.buildingId ? toObjectId(input.buildingId) : null,
    ownerId: input.ownerId ? toObjectId(input.ownerId) : null,
    code: input.code,
    chargeMillimes: input.chargeMillimes,
    status: "ACTIVE",
    ...newTimestamps(),
  };
  try {
    await (await collection()).insertOne(doc, { session });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new DuplicateLotCodeError(`Lot code "${input.code}" is already in use`);
    }
    throw error;
  }
  return toDomain(doc);
}

export async function findLotById(organizationId: string, id: string): Promise<Lot | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

export async function findLotsByIds(organizationId: string, ids: string[]): Promise<Lot[]> {
  if (ids.length === 0) return [];
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId), _id: { $in: ids.map(toObjectId) } })
    .toArray();
  return docs.map(toDomain);
}

export interface ListLotsFilter {
  buildingId?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export async function listLots(organizationId: string, filter: ListLotsFilter = {}): Promise<Lot[]> {
  const query: Record<string, unknown> = { organizationId: toObjectId(organizationId) };
  if (filter.buildingId) query.buildingId = toObjectId(filter.buildingId);
  if (filter.status) query.status = filter.status;
  const docs = await (await collection()).find(query).sort({ code: 1 }).toArray();
  return docs.map(toDomain);
}

/** Sets (or clears, with null) who will own the lot in cycles still to open (see lots/ownership.ts). */
export async function setLotOwner(
  organizationId: string,
  lotId: string,
  ownerId: string | null,
  session?: ClientSession,
): Promise<Lot | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(lotId), organizationId: toObjectId(organizationId) },
    { $set: { ownerId: ownerId ? toObjectId(ownerId) : null, updatedAt: new Date() } },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

export async function updateLot(
  organizationId: string,
  lotId: string,
  patch: { buildingId: string; code: string; chargeMillimes: number },
  session: ClientSession,
): Promise<Lot | null> {
  try {
    const result = await (
      await collection()
    ).findOneAndUpdate(
      { _id: toObjectId(lotId), organizationId: toObjectId(organizationId) },
      {
        $set: {
          buildingId: toObjectId(patch.buildingId),
          code: patch.code,
          chargeMillimes: patch.chargeMillimes,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after", session },
    );
    return result ? toDomain(result) : null;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new DuplicateLotCodeError(`Lot code "${patch.code}" is already in use`);
    }
    throw error;
  }
}

export async function deleteLot(organizationId: string, lotId: string, session: ClientSession): Promise<boolean> {
  const result = await (
    await collection()
  ).deleteOne({ _id: toObjectId(lotId), organizationId: toObjectId(organizationId) }, { session });
  return result.deletedCount === 1;
}
