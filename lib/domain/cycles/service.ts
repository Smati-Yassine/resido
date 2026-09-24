import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import {
  createCycleInputSchema,
  cycleIdInputSchema,
  setOpeningBalanceInputSchema,
  type CreateCycleInput,
  type CycleIdInput,
  type SetOpeningBalanceInput,
  type Cycle,
} from "./schema";
import * as repo from "./repository";
import { AnotherCycleOpenError } from "./repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import { writeAuditLog } from "@/lib/audit/log";
import { sumCompletedPaymentsForCycle } from "@/lib/domain/payments/repository";
import { sumRecordedExpensesForCycle } from "@/lib/domain/expenses/repository";

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "ANOTHER_CYCLE_OPEN" | "CONFLICT";
      message: string;
    };

function validationError(error: { issues: { message: string }[] }) {
  return {
    ok: false as const,
    code: "VALIDATION_ERROR" as const,
    message: error.issues[0]?.message ?? "Invalid input",
  };
}

/** New cycles start as DRAFT and are chained after the most recent one — see ADR-005. */
export async function createCycle(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CreateCycleInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:manage");

  const parsed = createCycleInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const existing = await repo.listCycles(organizationId);
  const mostRecent = existing[0] ?? null;

  const cycle = await repo.insertDraftCycle(organizationId, {
    name: parsed.data.name,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    createdBy: session.userId,
    previousCycleId: mostRecent?.id ?? null,
  });
  if (mostRecent) await repo.linkNextCycle(organizationId, mostRecent.id, cycle.id);
  await writeAuditLog({
    organizationId,
    actorUserId: session.userId,
    action: "CYCLE_CREATED",
    entityType: "cycle",
    entityId: cycle.id,
    metadata: { name: cycle.name },
  });

  return { ok: true, data: cycle };
}

export async function listCycles(session: AuthorizedSession, organizationId: string): Promise<Result<Cycle[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return { ok: true, data: await repo.listCycles(organizationId) };
}

/**
 * Opens a DRAFT cycle: bills every active lot its annual charge (one
 * assessment each) and carries the previous cycle's closing balance over as
 * the opening treasury balance — all atomically. At most one cycle is OPEN
 * per residence (unique partial index, surfaced as ANOTHER_CYCLE_OPEN).
 */
export async function openCycle(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CycleIdInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:manage");

  const parsed = cycleIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const cycle = await repo.findCycleById(organizationId, parsed.data.cycleId);
  if (!cycle) return { ok: false, code: "NOT_FOUND", message: "Cycle not found" };
  if (cycle.status !== "DRAFT") {
    return { ok: false, code: "CONFLICT", message: `Cycle is ${cycle.status}, expected DRAFT` };
  }

  const activeLots = await lotsRepo.listLots(organizationId, { status: "ACTIVE" });
  const previous = cycle.previousCycleId ? await repo.findCycleById(organizationId, cycle.previousCycleId) : null;
  const openingTreasuryBalanceMillimes = previous?.closingTreasuryBalanceMillimes ?? 0;

  try {
    const opened = await withTransaction(async (dbSession) => {
      const updated = await repo.markCycleOpen(
        organizationId,
        cycle.id,
        { openedAt: new Date(), openingTreasuryBalanceMillimes },
        dbSession,
      );
      if (!updated) throw new ConflictDuringOpenError();
      await assessmentsRepo.insertAssessments(
        organizationId,
        cycle.id,
        activeLots.map((lot) => ({
          lotId: lot.id,
          amountMillimes: lot.chargeMillimes,
          calculationMethod: "FIXED" as const,
          dueDate: cycle.startDate,
        })),
        dbSession,
      );
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "CYCLE_OPENED",
          entityType: "cycle",
          entityId: updated.id,
          metadata: { name: cycle.name, assessmentCount: activeLots.length, openingTreasuryBalanceMillimes },
        },
        dbSession,
      );
      return updated;
    });
    return { ok: true, data: opened };
  } catch (error) {
    if (error instanceof AnotherCycleOpenError) {
      return { ok: false, code: "ANOTHER_CYCLE_OPEN", message: error.message };
    }
    if (error instanceof ConflictDuringOpenError) {
      return { ok: false, code: "CONFLICT", message: "Cycle was no longer in DRAFT status" };
    }
    throw error;
  }
}

class ConflictDuringOpenError extends Error {}

/** Closes the OPEN cycle and snapshots its closing balance; an open-ended cycle's end date becomes today. */
export async function closeCycle(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CycleIdInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:manage");

  const parsed = cycleIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const cycle = await repo.findCycleById(organizationId, parsed.data.cycleId);
  if (!cycle) return { ok: false, code: "NOT_FOUND", message: "Cycle not found" };
  const treasury = await computeCycleTreasury(organizationId, cycle);

  const closed = await withTransaction(async (dbSession) => {
    const result = await repo.markCycleClosed(
      organizationId,
      cycle.id,
      session.userId,
      new Date(),
      treasury.closingBalanceMillimes,
      dbSession,
    );
    if (result) {
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "CYCLE_CLOSED",
          entityType: "cycle",
          entityId: result.id,
          metadata: { name: cycle.name, closingTreasuryBalanceMillimes: treasury.closingBalanceMillimes },
        },
        dbSession,
      );
    }
    return result;
  });
  if (!closed) return { ok: false, code: "CONFLICT", message: "Cycle is not currently OPEN" };
  return { ok: true, data: closed };
}

/**
 * Permanently deletes a cycle of any status, with its assessments, payments
 * and expenses. A later cycle keeps the opening balance it already carried
 * over — deleting history does not rewrite the present.
 */
export async function deleteCycle(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CycleIdInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:manage");

  const parsed = cycleIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const cycle = await repo.findCycleById(organizationId, parsed.data.cycleId);
  if (!cycle) return { ok: false, code: "NOT_FOUND", message: "Cycle not found" };

  await withTransaction(async (dbSession) => {
    await repo.deleteCycleCascade(organizationId, cycle, dbSession);
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "CYCLE_DELETED",
        entityType: "cycle",
        entityId: cycle.id,
        metadata: { name: cycle.name, status: cycle.status },
      },
      dbSession,
    );
  });
  return { ok: true, data: cycle };
}

/** Types in the cycle's starting treasury balance. Only while the cycle is OPEN — a CLOSED cycle's figures are frozen. */
export async function setOpeningBalance(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: SetOpeningBalanceInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "treasury:*");

  const parsed = setOpeningBalanceInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);

  const updated = await repo.setOpeningBalance(
    organizationId,
    parsed.data.cycleId,
    parsed.data.openingTreasuryBalanceMillimes,
  );
  if (!updated) return { ok: false, code: "CONFLICT", message: "Cycle is not OPEN" };
  await writeAuditLog({
    organizationId,
    actorUserId: session.userId,
    action: "OPENING_BALANCE_SET",
    entityType: "cycle",
    entityId: updated.id,
    metadata: { name: updated.name, amountMillimes: parsed.data.openingTreasuryBalanceMillimes },
  });
  return { ok: true, data: updated };
}

export interface CycleTreasury {
  openingBalanceMillimes: number;
  incomeMillimes: number;
  expenseMillimes: number;
  closingBalanceMillimes: number;
}

export async function computeCycleTreasury(organizationId: string, cycle: Cycle): Promise<CycleTreasury> {
  const opening = cycle.openingTreasuryBalanceMillimes ?? 0;
  const [income, expense] = await Promise.all([
    sumCompletedPaymentsForCycle(organizationId, cycle.id),
    sumRecordedExpensesForCycle(organizationId, cycle.id),
  ]);
  return {
    openingBalanceMillimes: opening,
    incomeMillimes: income,
    expenseMillimes: expense,
    closingBalanceMillimes: opening + income - expense,
  };
}

/**
 * The cycle's single running treasury position — opening balance + payments
 * received - expenses recorded, matching the "Solde depart + Recette -
 * Depense = Solde" pattern in docs/01-excel-analysis.md.
 */
export async function getCycleTreasury(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Result<CycleTreasury>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "treasury:read");
  const cycle = await repo.findCycleById(organizationId, cycleId);
  if (!cycle) return { ok: false, code: "NOT_FOUND", message: "Cycle not found" };
  return { ok: true, data: await computeCycleTreasury(organizationId, cycle) };
}
