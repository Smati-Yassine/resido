import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import type { Role } from "@/lib/rbac/permissions";

/**
 * A pending access grant for an email that has no account yet. It turns
 * into a membership when someone registers (or changes their email) to that
 * address — see lib/domain/members/service#claimInvitations.
 */
interface InvitationDoc {
  _id: ObjectId;
  organizationId: ObjectId;
  email: string;
  role: Role;
  invitedBy: ObjectId;
  createdAt: Date;
}

export interface Invitation {
  id: string;
  residenceId: string;
  email: string;
  role: Role;
  createdAt: Date;
}

function toDomain(doc: InvitationDoc): Invitation {
  return {
    id: fromObjectId(doc._id),
    residenceId: fromObjectId(doc.organizationId),
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<InvitationDoc>(COLLECTIONS.invitations);
}

/** Creates the invitation, or updates its role if this email was already invited. */
export async function upsertInvitation(
  residenceId: string,
  email: string,
  role: Role,
  invitedBy: string,
): Promise<Invitation> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { organizationId: toObjectId(residenceId), email },
    {
      $set: { role, invitedBy: toObjectId(invitedBy) },
      $setOnInsert: { _id: new ObjectId(), createdAt: new Date() },
    },
    { upsert: true, returnDocument: "after" },
  );
  return toDomain(result!);
}

export async function listInvitationsForResidence(residenceId: string): Promise<Invitation[]> {
  const docs = await (
    await collection()
  )
    .find({ organizationId: toObjectId(residenceId) })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toDomain);
}

export async function listInvitationsForEmail(email: string): Promise<Invitation[]> {
  const docs = await (await collection()).find({ email }).toArray();
  return docs.map(toDomain);
}

export async function deleteInvitation(
  residenceId: string,
  invitationId: string,
  session?: ClientSession,
): Promise<boolean> {
  const result = await (
    await collection()
  ).deleteOne({ _id: toObjectId(invitationId), organizationId: toObjectId(residenceId) }, { session });
  return result.deletedCount === 1;
}
