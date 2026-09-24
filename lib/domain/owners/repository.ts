import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import { newTimestamps } from "@/lib/db/timestamps";
import type { Owner } from "./schema";

interface OwnerDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  name: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(doc: OwnerDoc): Owner {
  return {
    id: fromObjectId(doc._id),
    organizationId: fromObjectId(doc.organizationId),
    name: doc.name,
    phone: doc.phone ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<OwnerDoc>(COLLECTIONS.owners);
}

export async function insertOwner(
  organizationId: string,
  input: { name: string; phone: string | null },
  session: ClientSession,
): Promise<Owner> {
  const doc: OwnerDoc = {
    _id: new ObjectId(),
    organizationId: toObjectId(organizationId),
    name: input.name,
    phone: input.phone,
    ...newTimestamps(),
  };
  await (await collection()).insertOne(doc, { session });
  return toDomain(doc);
}

export async function findOwnerById(organizationId: string, id: string): Promise<Owner | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) });
  return doc ? toDomain(doc) : null;
}

export async function listOwners(organizationId: string): Promise<Owner[]> {
  const docs = await (
    await collection()
  )
    // Documents from the pre-ADR-011 owner model have no `name`; they are not part of this model.
    .find({ organizationId: toObjectId(organizationId), name: { $type: "string" } })
    .collation({ locale: "fr", strength: 2 })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toDomain);
}

export async function updateOwner(
  organizationId: string,
  id: string,
  patch: { name: string; phone: string | null },
  session: ClientSession,
): Promise<Owner | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(id), organizationId: toObjectId(organizationId) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after", session },
  );
  return result ? toDomain(result) : null;
}

export async function deleteOwner(organizationId: string, id: string, session: ClientSession): Promise<boolean> {
  const result = await (
    await collection()
  ).deleteOne({ _id: toObjectId(id), organizationId: toObjectId(organizationId) }, { session });
  return result.deletedCount === 1;
}
