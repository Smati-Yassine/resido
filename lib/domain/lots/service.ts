import { writeAuditLog } from "@/lib/audit/log";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import {
  createLotInputSchema,
  setLotOwnerInputSchema,
  type CreateLotInput,
  type SetLotOwnerInput,
  type Lot,
} from "./schema";
import * as repo from "./repository";
import { DuplicateLotCodeError, type ListLotsFilter } from "./repository";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";

export type Result<T> =
  { ok: true; data: T } | { ok: false; code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE_CODE"; message: string };

/**
 * Creates a lot inside a bloc. If a cycle is OPEN, the lot is billed its
 * annual charge in that cycle straight away, in the same transaction — a lot
 * added mid-cycle is never silently left out of the cycle's charges.
 */
export async function createLot(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CreateLotInput,
): Promise<Result<Lot>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:*");

  const parsed = createLotInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const building = await buildingsRepo.findBuildingById(organizationId, parsed.data.buildingId);
  if (!building) return { ok: false, code: "NOT_FOUND", message: "Bloc not found" };
  if (parsed.data.ownerId && !(await ownersRepo.findOwnerById(organizationId, parsed.data.ownerId))) {
    return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  }

  const openCycle = await cyclesRepo.findOpenCycle(organizationId);
  try {
    const lot = await withTransaction(async (dbSession) => {
      const created = await repo.insertLot(
        organizationId,
        {
          buildingId: building.id,
          ownerId: parsed.data.ownerId ?? null,
          code: parsed.data.code,
          chargeMillimes: parsed.data.chargeMillimes,
        },
        dbSession,
      );
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "LOT_CREATED",
          entityType: "lot",
          entityId: created.id,
          metadata: { code: created.code, chargeMillimes: created.chargeMillimes },
        },
        dbSession,
      );
      if (openCycle) {
        await assessmentsRepo.insertAssessments(
          organizationId,
          openCycle.id,
          [
            {
              lotId: created.id,
              amountMillimes: created.chargeMillimes,
              calculationMethod: "FIXED",
              dueDate: new Date(),
            },
          ],
          dbSession,
        );
      }
      return created;
    });
    return { ok: true, data: lot };
  } catch (error) {
    if (error instanceof DuplicateLotCodeError) {
      return { ok: false, code: "DUPLICATE_CODE", message: error.message };
    }
    throw error;
  }
}

export async function listLots(
  session: AuthorizedSession,
  organizationId: string,
  filter: ListLotsFilter = {},
): Promise<Result<Lot[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:read");
  return { ok: true, data: await repo.listLots(organizationId, filter) };
}

/** Assigns a lot to an owner, or leaves it without one (ownerId null). */
export async function setLotOwner(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: SetLotOwnerInput,
): Promise<Result<Lot>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:*");

  const parsed = setLotOwnerInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.ownerId && !(await ownersRepo.findOwnerById(organizationId, parsed.data.ownerId))) {
    return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  }
  const lot = await repo.setLotOwner(organizationId, parsed.data.lotId, parsed.data.ownerId);
  if (!lot) return { ok: false, code: "NOT_FOUND", message: "Lot not found" };
  const owner = parsed.data.ownerId ? await ownersRepo.findOwnerById(organizationId, parsed.data.ownerId) : null;
  await writeAuditLog({
    organizationId,
    actorUserId: session.userId,
    action: "LOT_OWNER_SET",
    entityType: "lot",
    entityId: lot.id,
    metadata: { code: lot.code, name: owner?.name ?? null },
  });
  return { ok: true, data: lot };
}
