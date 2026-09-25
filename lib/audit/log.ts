import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { toObjectId } from "@/lib/db/ids";

/**
 * Cross-cutting audit trail — see docs/03-mongodb-architecture.md
 * #auditLogs and docs/07-auth-security.md. Every financial mutation writes
 * one of these inside the same transaction as the mutation itself, so an
 * audit entry can never be missing for a write that succeeded. Append-only:
 * no update/delete API is exposed for this collection.
 */
export const AUDIT_ACTIONS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CANCELLED",
  "PAYMENT_REVERSED",
  "EXPENSE_CREATED",
  "EXPENSE_UPDATED",
  "EXPENSE_CANCELLED",
  "CYCLE_OPENED",
  "CYCLE_CLOSED",
  "CYCLE_DELETED",
  "CYCLE_CREATED",
  "OPENING_BALANCE_SET",
  "BLOC_CREATED",
  "LOT_CREATED",
  "LOT_OWNER_SET",
  "OWNER_CREATED",
  "OWNER_UPDATED",
  "OWNER_DELETED",
  "RESIDENCE_UPDATED",
  "RESIDENCE_ARCHIVED",
  "RESIDENCE_RESTORED",
  "MEMBER_ADDED",
  "MEMBER_INVITED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_REMOVED",
  "INVITATION_CANCELLED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface WriteAuditLogInput {
  organizationId: string;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Financial mutations pass their transaction `session` so the entry commits
 * with the change; simpler single-document changes log without one.
 */
export async function writeAuditLog(input: WriteAuditLogInput, session?: ClientSession): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTIONS.auditLogs).insertOne(
    {
      _id: new ObjectId(),
      organizationId: toObjectId(input.organizationId),
      actorUserId: toObjectId(input.actorUserId),
      action: input.action,
      entityType: input.entityType,
      entityId: toObjectId(input.entityId),
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    },
    { session },
  );
}

export interface AuditEntry {
  id: string;
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** The residence's most recent activity, newest first. */
export async function listAuditLog(organizationId: string, limit = 200): Promise<AuditEntry[]> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTIONS.auditLogs)
    .find({ organizationId: toObjectId(organizationId) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    actorUserId: doc.actorUserId.toHexString(),
    action: doc.action as AuditAction,
    entityType: doc.entityType as string,
    metadata: (doc.metadata ?? {}) as Record<string, unknown>,
    createdAt: doc.createdAt as Date,
  }));
}
