import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import { newTimestamps } from "@/lib/db/timestamps";
import type { Building } from "./schema";

interface BuildingDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(doc: BuildingDoc): Building {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<BuildingDoc>(COLLECTIONS.buildings);
}

export class DuplicateBuildingNameError extends Error {}

export async function insertBuilding(organizationId: string, input: { name: string }): Promise<Building> {
  const doc: BuildingDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    name: input.name,
    ...newTimestamps(),
  };
  try {
    await (await collection()).insertOne(doc);
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
      throw new DuplicateBuildingNameError(`Bloc "${input.name}" already exists`);
    }
    throw error;
  }
  return toDomain(doc);
}

export async function findBuildingById(organizationId: string, id: string): Promise<Building | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

export async function listBuildings(organizationId: string): Promise<Building[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(organizationId) })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toDomain);
}
