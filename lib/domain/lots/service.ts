import { writeAuditLog } from "@/lib/audit/log";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import {
  createLotInputSchema,
  updateLotInputSchema,
  type CreateLotInput,
  type UpdateLotInput,
  type Lot,
} from "./schema";
import * as repo from "./repository";
import { DuplicateLotCodeError, type ListLotsFilter } from "./repository";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";
import * as paymentsRepo from "@/lib/domain/payments/repository";
import { changeLotOwners, defaultCycleId } from "./ownership";

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE_CODE" | "CHARGE_BELOW_PAID" | "HAS_HISTORY";
      message: string;
    };

/** Every id names an owner of this residence. */
async function ownersExist(organizationId: string, ownerIds: string[]): Promise<boolean> {
  const found = await Promise.all(ownerIds.map((id) => ownersRepo.findOwnerById(organizationId, id)));
  return found.every((o) => o !== null);
}

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
  if (!(await ownersExist(organizationId, parsed.data.ownerIds))) {
    return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  }

  const openCycle = await cyclesRepo.findOpenCycle(organizationId);
  try {
    const lot = await withTransaction(async (dbSession) => {
      const created = await repo.insertLot(
        organizationId,
        {
          buildingId: building.id,
          ownerIds: [...new Set(parsed.data.ownerIds)],
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
              ownerIds: created.ownerIds,
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

/**
 * Edits a lot as seen in one cycle (`cycleId`, the open one by default).
 * Code and bloc are the lot's own. The charge is what that cycle bills — refused
 * below what the lot already paid in it — and becomes the lot's charge for
 * cycles still to open when no later cycle is billed. The owner changes from
 * that cycle onward (see changeLotOwners); earlier cycles keep theirs.
 */
export async function updateLot(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: UpdateLotInput,
  cycleId?: string | null,
): Promise<Result<Lot>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:*");

  const parsed = updateLotInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const lot = await repo.findLotById(organizationId, input.lotId);
  if (!lot) return { ok: false, code: "NOT_FOUND", message: "Lot not found" };
  if (!(await buildingsRepo.findBuildingById(organizationId, input.buildingId))) {
    return { ok: false, code: "NOT_FOUND", message: "Bloc not found" };
  }
  if (!(await ownersExist(organizationId, input.ownerIds))) {
    return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  }

  const fromCycleId = cycleId === undefined ? await defaultCycleId(organizationId) : cycleId;
  const cycles = await cyclesRepo.listCycles(organizationId);
  const viewed = cycles.find((c) => c.id === fromCycleId && c.status !== "DRAFT") ?? null;
  const assessment = viewed ? await assessmentsRepo.findAssessment(organizationId, viewed.id, lot.id) : null;
  if (assessment && input.chargeMillimes < assessment.paidMillimes) {
    return { ok: false, code: "CHARGE_BELOW_PAID", message: "The new charge is below what is already paid" };
  }
  const laterCycleBilled =
    !!viewed && cycles.some((c) => c.status !== "DRAFT" && c.startDate.getTime() > viewed.startDate.getTime());

  try {
    const updated = await withTransaction(async (dbSession) => {
      const doc = await repo.updateLot(
        organizationId,
        lot.id,
        {
          buildingId: input.buildingId,
          code: input.code,
          chargeMillimes: laterCycleBilled ? lot.chargeMillimes : input.chargeMillimes,
        },
        dbSession,
      );
      if (!doc) throw new Error("Lot disappeared");
      if (assessment && assessment.amountMillimes !== input.chargeMillimes) {
        const changed = await assessmentsRepo.setAssessmentAmount(
          organizationId,
          assessment.id,
          input.chargeMillimes,
          dbSession,
        );
        if (!changed) throw new ChargeBelowPaidError();
      }
      await changeLotOwners(organizationId, lot, [...new Set(input.ownerIds)], fromCycleId, dbSession);
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "LOT_UPDATED",
          entityType: "lot",
          entityId: lot.id,
          metadata: { code: doc.code, chargeMillimes: input.chargeMillimes, cycle: viewed?.name },
        },
        dbSession,
      );
      return doc;
    });
    // Re-read after commit: the owner may have changed alongside.
    return { ok: true, data: (await repo.findLotById(organizationId, lot.id)) ?? updated };
  } catch (error) {
    if (error instanceof DuplicateLotCodeError) return { ok: false, code: "DUPLICATE_CODE", message: error.message };
    if (error instanceof ChargeBelowPaidError) {
      return { ok: false, code: "CHARGE_BELOW_PAID", message: "The new charge is below what is already paid" };
    }
    throw error;
  }
}

class ChargeBelowPaidError extends Error {}

/**
 * Deletes a lot created by mistake: only while nothing was ever paid on it
 * and no closed cycle billed it — the history of a real lot is never erased.
 * Its charge in the OPEN cycle is removed with it.
 */
export async function deleteLot(
  session: AuthorizedSession,
  organizationId: string,
  lotId: string,
): Promise<Result<Lot>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:*");

  const lot = await repo.findLotById(organizationId, lotId);
  if (!lot) return { ok: false, code: "NOT_FOUND", message: "Lot not found" };
  const assessments = await assessmentsRepo.listAssessmentsForLot(organizationId, lot.id);
  const cycles = await Promise.all(assessments.map((a) => cyclesRepo.findCycleById(organizationId, a.cycleId)));
  const billedInClosedCycle = cycles.some((c) => c && c.status === "CLOSED");
  if (billedInClosedCycle || (await paymentsRepo.lotHasPayments(organizationId, lot.id))) {
    return { ok: false, code: "HAS_HISTORY", message: "This lot has payments or belongs to a closed cycle" };
  }

  await withTransaction(async (dbSession) => {
    for (const assessment of assessments) {
      await assessmentsRepo.deleteAssessment(organizationId, assessment.id, dbSession);
    }
    await repo.deleteLot(organizationId, lot.id, dbSession);
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "LOT_DELETED",
        entityType: "lot",
        entityId: lot.id,
        metadata: { code: lot.code },
      },
      dbSession,
    );
  });
  return { ok: true, data: lot };
}
