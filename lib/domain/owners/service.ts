import { writeAuditLog } from "@/lib/audit/log";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { ownerInputSchema, type Owner, type OwnerInput } from "./schema";
import * as repo from "./repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import { changeLotOwners, defaultCycleId, lotOwnersInCycle, removeOwnerFrom } from "@/lib/domain/lots/ownership";
import type { ClientSession } from "mongodb";

export type Result<T> = { ok: true; data: T } | { ok: false; code: "VALIDATION_ERROR" | "NOT_FOUND"; message: string };

type Parsed =
  | { ok: true; name: string; phone: string | null; lotIds: string[]; shareLotIds: string[] }
  | { ok: false; message: string };

async function parse(organizationId: string, rawInput: OwnerInput): Promise<Parsed> {
  const parsed = ownerInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  // Only lots of this residence can be assigned.
  const known = new Set((await lotsRepo.listLots(organizationId)).map((l) => l.id));
  const lotIds = [...new Set(parsed.data.lotIds)];
  if (lotIds.some((id) => !known.has(id))) return { ok: false, message: "Unknown lot" };
  const shareLotIds = parsed.data.shareLotIds.filter((id) => lotIds.includes(id));
  return { ok: true, name: parsed.data.name, phone: parsed.data.phone || null, lotIds, shareLotIds };
}

/**
 * Makes `lotIds` exactly the lots `ownerId` holds in `cycleId`. A lot owned by
 * someone else is handed over — or, listed in `shareLotIds`, shared: this
 * owner joins its owners. Lots they held there and no longer list lose them
 * (co-owners keep theirs). Each change runs from that cycle onward
 * (changeLotOwners).
 */
async function assignLots(
  organizationId: string,
  ownerId: string,
  lotIds: string[],
  shareLotIds: string[],
  cycleId: string | null,
  dbSession: ClientSession,
): Promise<void> {
  const lots = await lotsRepo.listLots(organizationId);
  const owners = await lotOwnersInCycle(organizationId, lots, cycleId);
  const wanted = new Set(lotIds);
  const shared = new Set(shareLotIds);
  for (const lot of lots) {
    const current = owners.get(lot.id) ?? [];
    const holds = current.includes(ownerId);
    if (wanted.has(lot.id) && !holds) {
      const next = shared.has(lot.id) ? [...current, ownerId] : [ownerId];
      await changeLotOwners(organizationId, lot, next, cycleId, dbSession);
    }
    if (!wanted.has(lot.id) && holds) {
      await changeLotOwners(
        organizationId,
        lot,
        current.filter((id) => id !== ownerId),
        cycleId,
        dbSession,
      );
    }
  }
}

/**
 * Creates an owner and hands them the chosen lots (taken from any previous
 * owner) from `cycleId` onward — the open cycle by default — atomically.
 */
export async function createOwner(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: OwnerInput,
  cycleId?: string | null,
): Promise<Result<Owner>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "owners:*");
  const input = await parse(organizationId, rawInput);
  if (!input.ok) return { ok: false, code: "VALIDATION_ERROR", message: input.message };
  const from = cycleId === undefined ? await defaultCycleId(organizationId) : cycleId;

  const owner = await withTransaction(async (dbSession) => {
    const created = await repo.insertOwner(organizationId, { name: input.name, phone: input.phone }, dbSession);
    await assignLots(organizationId, created.id, input.lotIds, input.shareLotIds, from, dbSession);
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "OWNER_CREATED",
        entityType: "owner",
        entityId: created.id,
        metadata: { name: created.name, lotCount: input.lotIds.length },
      },
      dbSession,
    );
    return created;
  });
  return { ok: true, data: owner };
}

/** Updates an owner; `lotIds` becomes exactly the lots they hold in `cycleId` (the open cycle by default) and after. */
export async function updateOwner(
  session: AuthorizedSession,
  organizationId: string,
  ownerId: string,
  rawInput: OwnerInput,
  cycleId?: string | null,
): Promise<Result<Owner>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "owners:*");
  const input = await parse(organizationId, rawInput);
  if (!input.ok) return { ok: false, code: "VALIDATION_ERROR", message: input.message };
  const from = cycleId === undefined ? await defaultCycleId(organizationId) : cycleId;

  const owner = await withTransaction(async (dbSession) => {
    const updated = await repo.updateOwner(
      organizationId,
      ownerId,
      { name: input.name, phone: input.phone },
      dbSession,
    );
    if (updated) {
      await assignLots(organizationId, ownerId, input.lotIds, input.shareLotIds, from, dbSession);
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "OWNER_UPDATED",
          entityType: "owner",
          entityId: ownerId,
          metadata: { name: updated.name, lotCount: input.lotIds.length },
        },
        dbSession,
      );
    }
    return updated;
  });
  if (!owner) return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  return { ok: true, data: owner };
}

/**
 * Removes an owner from `cycleId` (the open cycle by default) onward: their
 * lots there and after are left without an owner, earlier cycles keep them.
 * An owner no cycle names any more is deleted; one still named by a past
 * cycle is kept for that history, hidden from the present (`removed`).
 * Past payments keep the payer's name.
 */
export async function deleteOwner(
  session: AuthorizedSession,
  organizationId: string,
  ownerId: string,
  cycleId?: string | null,
): Promise<Result<Owner>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "owners:*");
  const owner = await repo.findOwnerById(organizationId, ownerId);
  if (!owner) return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  const from = cycleId === undefined ? await defaultCycleId(organizationId) : cycleId;
  await withTransaction(async (dbSession) => {
    await removeOwnerFrom(organizationId, ownerId, from, dbSession);
    if (await assessmentsRepo.ownerHasAssessments(organizationId, ownerId, dbSession)) {
      await repo.markOwnerRemoved(organizationId, ownerId, dbSession);
    } else {
      await repo.deleteOwner(organizationId, ownerId, dbSession);
    }
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "OWNER_DELETED",
        entityType: "owner",
        entityId: ownerId,
        metadata: { name: owner.name },
      },
      dbSession,
    );
  });
  return { ok: true, data: owner };
}

export async function listOwners(session: AuthorizedSession, organizationId: string): Promise<Result<Owner[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "owners:read");
  return { ok: true, data: await repo.listOwners(organizationId) };
}
