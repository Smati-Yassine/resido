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

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE_CODE" | "CHARGE_BELOW_PAID" | "HAS_HISTORY";
      message: string;
    };

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

/**
 * Edits a lot: bloc, code, annual charge, owner. A new charge also becomes
 * what the OPEN cycle bills the lot — refused if that is less than what the
 * lot has already paid in it. Closed cycles keep the charge they billed.
 */
export async function updateLot(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: UpdateLotInput,
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
  if (input.ownerId && !(await ownersRepo.findOwnerById(organizationId, input.ownerId))) {
    return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
  }

  const openCycle = await cyclesRepo.findOpenCycle(organizationId);
  const openAssessment = openCycle ? await assessmentsRepo.findAssessment(organizationId, openCycle.id, lot.id) : null;
  if (openAssessment && input.chargeMillimes < openAssessment.paidMillimes) {
    return { ok: false, code: "CHARGE_BELOW_PAID", message: "The new charge is below what is already paid" };
  }

  try {
    const updated = await withTransaction(async (dbSession) => {
      const doc = await repo.updateLot(
        organizationId,
        lot.id,
        {
          buildingId: input.buildingId,
          code: input.code,
          chargeMillimes: input.chargeMillimes,
          ownerId: input.ownerId,
        },
        dbSession,
      );
      if (!doc) throw new Error("Lot disappeared");
      if (openAssessment && openAssessment.amountMillimes !== input.chargeMillimes) {
        const assessment = await assessmentsRepo.setAssessmentAmount(
          organizationId,
          openAssessment.id,
          input.chargeMillimes,
          dbSession,
        );
        if (!assessment) throw new ChargeBelowPaidError();
      }
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "LOT_UPDATED",
          entityType: "lot",
          entityId: lot.id,
          metadata: { code: doc.code, chargeMillimes: doc.chargeMillimes },
        },
        dbSession,
      );
      return doc;
    });
    return { ok: true, data: updated };
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
