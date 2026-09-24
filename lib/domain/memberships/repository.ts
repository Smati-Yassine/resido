import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Role } from "@/lib/rbac/permissions";

/**
 * Grants one user a role inside one residence. A user reaches a residence
 * only through a membership row, so every residence-scoped request resolves
 * the role from here (lib/session#requireResidenceSession), never from the
 * JWT or client input.
 */
interface MembershipDoc {
  _id: ObjectId;
  userId: ObjectId;
  organizationId: ObjectId;
  role: Role;
  createdAt: Date;
}

export interface Membership {
  userId: string;
  residenceId: string;
  role: Role;
}

function toDomain(doc: MembershipDoc): Membership {
  return { userId: fromObjectId(doc.userId), residenceId: fromObjectId(doc.organizationId), role: doc.role };
}

async function collection() {
  const db = await getDb();
  return db.collection<MembershipDoc>(COLLECTIONS.memberships);
}

export async function insertMembership(
  input: { userId: string; residenceId: string; role: Role },
  session: ClientSession,
): Promise<Membership> {
  const doc: MembershipDoc = {
    _id: new ObjectId(),
    userId: toObjectId(input.userId),
    organizationId: toObjectId(input.residenceId),
    role: input.role,
    createdAt: new Date(),
  };
  await (await collection()).insertOne(doc, { session });
  return toDomain(doc);
}

export async function findMembership(userId: string, residenceId: string): Promise<Membership | null> {
  const doc = await (
    await collection()
  ).findOne({
    userId: toObjectId(userId),
    organizationId: toObjectId(residenceId),
  });
  return doc ? toDomain(doc) : null;
}

export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  const docs = await (await collection()).find({ userId: toObjectId(userId) }).toArray();
  return docs.map(toDomain);
}

export async function countMembers(residenceId: string): Promise<number> {
  return (await collection()).countDocuments({ organizationId: toObjectId(residenceId) });
}

export async function deleteMembership(userId: string, residenceId: string, session: ClientSession): Promise<void> {
  await (
    await collection()
  ).deleteOne({ userId: toObjectId(userId), organizationId: toObjectId(residenceId) }, { session });
}

export interface MemberRow extends Membership {
  since: Date;
}

/** Everyone in a residence, oldest member first. */
export async function listMembers(residenceId: string): Promise<MemberRow[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(residenceId) })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return docs.map((doc) => ({ ...toDomain(doc), since: doc.createdAt }));
}

export async function setMemberRole(
  userId: string,
  residenceId: string,
  role: Role,
  session?: ClientSession,
): Promise<boolean> {
  const result = await (
    await collection()
  ).updateOne({ userId: toObjectId(userId), organizationId: toObjectId(residenceId) }, { $set: { role } }, { session });
  return result.matchedCount === 1;
}
