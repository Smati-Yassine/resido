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
import { sumCompletedPaymentsByCycle } from "@/lib/domain/payments/repository";
import { sumRecordedExpensesByCycle } from "@/lib/domain/expenses/repository";

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

export async function getCycle(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Cycle | null> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return repo.findCycleById(organizationId, cycleId);
}

export async function listCycles(session: AuthorizedSession, organizationId: string): Promise<Result<Cycle[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return { ok: true, data: await repo.listCycles(organizationId) };
}

/**
 * Opens a DRAFT cycle: bills every active lot its annual charge and records
 * its current owner (one assessment each), and starts the treasury from the
 * previous cycle's closing balance (CARRIED, so it keeps following that
 * cycle) — all atomically. At most one cycle is OPEN
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
  const previousTreasury = cycle.previousCycleId
    ? (await computeAllTreasuries(organizationId)).get(cycle.previousCycleId)
    : undefined;
  const openingTreasuryBalanceMillimes = previousTreasury?.closingBalanceMillimes ?? 0;

  try {
    const opened = await withTransaction(async (dbSession) => {
      const updated = await repo.markCycleOpen(
        organizationId,
        cycle.id,
        {
          openedAt: new Date(),
          openingTreasuryBalanceMillimes,
          openingSource: previousTreasury ? "CARRIED" : "MANUAL",
        },
        dbSession,
      );
      if (!updated) throw new ConflictDuringOpenError();
      await assessmentsRepo.insertAssessments(
        organizationId,
        cycle.id,
        activeLots.map((lot) => ({
          lotId: lot.id,
          ownerIds: lot.ownerIds,
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

/**
 * Closes the OPEN cycle — it stops being the current one, and the next can
 * open. Its data stays correctable; the closing balance is snapshotted for
 * the record. An open-ended cycle's end date becomes today.
 */
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
 * Reopens a CLOSED cycle, making it the current one again — refused while
 * another cycle is OPEN (close that one first).
 */
export async function reopenCycle(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CycleIdInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:manage");

  const parsed = cycleIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const open = await repo.findOpenCycle(organizationId);
  if (open) return { ok: false, code: "ANOTHER_CYCLE_OPEN", message: `${open.name} is OPEN` };

  try {
    const reopened = await repo.markCycleReopened(organizationId, parsed.data.cycleId);
    if (!reopened) return { ok: false, code: "CONFLICT", message: "Cycle is not CLOSED" };
    await writeAuditLog({
      organizationId,
      actorUserId: session.userId,
      action: "CYCLE_REOPENED",
      entityType: "cycle",
      entityId: reopened.id,
      metadata: { name: reopened.name },
    });
    return { ok: true, data: reopened };
  } catch (error) {
    if (error instanceof AnotherCycleOpenError) {
      return { ok: false, code: "ANOTHER_CYCLE_OPEN", message: error.message };
    }
    throw error;
  }
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

/**
 * Sets a billed cycle's starting treasury balance: a typed-in amount, or
 * `carry` to follow the previous cycle's closing balance again. Closed
 * cycles too — a correction flows into the cycles after it.
 */
export async function setOpeningBalance(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: SetOpeningBalanceInput,
): Promise<Result<Cycle>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "treasury:*");

  const parsed = setOpeningBalanceInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationError(parsed.error);
  const { cycleId, carry, openingTreasuryBalanceMillimes } = parsed.data;
  if (carry) {
    const cycle = await repo.findCycleById(organizationId, cycleId);
    if (!cycle?.previousCycleId) return { ok: false, code: "CONFLICT", message: "No previous cycle to carry from" };
  } else if (openingTreasuryBalanceMillimes === undefined) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Amount required" };
  }

  const updated = await repo.setOpeningBalance(
    organizationId,
    cycleId,
    carry ? { source: "CARRIED" } : { source: "MANUAL", amountMillimes: openingTreasuryBalanceMillimes! },
  );
  if (!updated) return { ok: false, code: "CONFLICT", message: "Cycle is not billed" };
  const treasury = (await computeAllTreasuries(organizationId)).get(updated.id)!;
  await writeAuditLog({
    organizationId,
    actorUserId: session.userId,
    action: "OPENING_BALANCE_SET",
    entityType: "cycle",
    entityId: updated.id,
    metadata: { name: updated.name, amountMillimes: treasury.openingBalanceMillimes, carried: carry },
  });
  return { ok: true, data: updated };
}

export interface CycleTreasury {
  openingBalanceMillimes: number;
  incomeMillimes: number;
  expenseMillimes: number;
  closingBalanceMillimes: number;
  /** The cycle whose closing balance this one starts from, when carried over. */
  carriedFrom: { id: string; name: string } | null;
}

/**
 * Whether a cycle's start follows its previous cycle's close. Cycles opened
 * before `openingSource` existed count as carried when their stored start
 * still equals the previous cycle's closing snapshot — i.e. nobody retyped it.
 */
function isCarried(cycle: Cycle, previous: Cycle | undefined): boolean {
  if (!previous) return false;
  if (cycle.status === "DRAFT") return true;
  if (cycle.openingSource) return cycle.openingSource === "CARRIED";
  return (
    previous.closingTreasuryBalanceMillimes !== null &&
    cycle.openingTreasuryBalanceMillimes === previous.closingTreasuryBalanceMillimes
  );
}

/**
 * Every cycle's treasury (start + payments − expenses = balance), oldest
 * first along the chain, so a carried start is the live closing balance of
 * the cycle before — a correction in 2025 moves 2026's start with it.
 */
export async function computeAllTreasuries(organizationId: string): Promise<Map<string, CycleTreasury>> {
  const [cycles, income, expense] = await Promise.all([
    repo.listCycles(organizationId),
    sumCompletedPaymentsByCycle(organizationId),
    sumRecordedExpensesByCycle(organizationId),
  ]);
  const byId = new Map(cycles.map((c) => [c.id, c]));
  const result = new Map<string, CycleTreasury>();
  for (const cycle of [...cycles].reverse()) {
    const previous = cycle.previousCycleId ? byId.get(cycle.previousCycleId) : undefined;
    const previousTreasury = previous ? result.get(previous.id) : undefined;
    const carried = !!previousTreasury && isCarried(cycle, previous);
    const opening = carried ? previousTreasury!.closingBalanceMillimes : (cycle.openingTreasuryBalanceMillimes ?? 0);
    const incomeMillimes = income.get(cycle.id) ?? 0;
    const expenseMillimes = expense.get(cycle.id) ?? 0;
    result.set(cycle.id, {
      openingBalanceMillimes: opening,
      incomeMillimes,
      expenseMillimes,
      closingBalanceMillimes: opening + incomeMillimes - expenseMillimes,
      carriedFrom: carried && previous ? { id: previous.id, name: previous.name } : null,
    });
  }
  return result;
}

export async function computeCycleTreasury(organizationId: string, cycle: Cycle): Promise<CycleTreasury> {
  const treasury = (await computeAllTreasuries(organizationId)).get(cycle.id);
  if (!treasury) throw new Error(`Cycle ${cycle.id} not found`);
  return treasury;
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
  const treasury = (await computeAllTreasuries(organizationId)).get(cycleId);
  if (!treasury) return { ok: false, code: "NOT_FOUND", message: "Cycle not found" };
  return { ok: true, data: treasury };
}
