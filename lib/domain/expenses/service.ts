import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { writeAuditLog } from "@/lib/audit/log";
import {
  createExpenseInputSchema,
  voidExpenseInputSchema,
  updateExpenseInputSchema,
  type UpdateExpenseInput,
  type CreateExpenseInput,
  type VoidExpenseInput,
  type Expense,
} from "./schema";
import * as repo from "./repository";
import { DuplicateIdempotencyKeyError } from "./repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "CYCLE_NOT_OPEN" | "ALREADY_VOIDED" | "CONFLICT";
      message: string;
    };

/**
 * Expenses are scoped to the organization's currently OPEN cycle at the
 * moment they're recorded (not recomputed later from the date) — see
 * docs/02-domain-model.md and docs/04-financial-model.md #cycle-closing
 * ("no new financial transactions may target a CLOSED cycle"). Idempotent
 * on `idempotencyKey`, same pattern as recordPayment.
 */
export async function recordExpense(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CreateExpenseInput,
): Promise<Result<Expense>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "expenses:create");

  const parsed = createExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const existing = await repo.findExpenseByIdempotencyKey(organizationId, input.idempotencyKey);
  if (existing) return { ok: true, data: existing };

  const openCycle = await cyclesRepo.findOpenCycle(organizationId);
  if (!openCycle) {
    return { ok: false, code: "CYCLE_NOT_OPEN", message: "No cycle is currently OPEN for this organization" };
  }

  try {
    const expense = await withTransaction(async (dbSession) => {
      const doc = await repo.insertExpense(
        organizationId,
        {
          cycleId: openCycle.id,
          label: input.label,
          amountMillimes: input.amountMillimes,
          reference: input.reference || null,
          date: input.date,
          idempotencyKey: input.idempotencyKey,
          createdBy: session.userId,
        },
        dbSession,
      );

      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "EXPENSE_CREATED",
          entityType: "expense",
          entityId: doc.id,
          metadata: { amountMillimes: doc.amountMillimes, label: doc.label },
        },
        dbSession,
      );
      return doc;
    });
    return { ok: true, data: expense };
  } catch (error) {
    if (error instanceof DuplicateIdempotencyKeyError) {
      const retried = await repo.findExpenseByIdempotencyKey(organizationId, input.idempotencyKey);
      if (retried) return { ok: true, data: retried };
      return { ok: false, code: "CONFLICT", message: error.message };
    }
    throw error;
  }
}

export async function listExpensesForCycle(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Result<Expense[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "expenses:read");
  return { ok: true, data: await repo.listExpensesForCycle(organizationId, cycleId) };
}

/** A closed cycle's figures are frozen: its expenses can be neither edited nor deleted. */
async function cycleIsOpen(organizationId: string, expense: Expense): Promise<boolean> {
  const cycle = await cyclesRepo.findCycleById(organizationId, expense.cycleId);
  return cycle?.status === "OPEN";
}

/** Edits an expense's label, amount, reference and date — only while its cycle is OPEN. */
export async function updateExpense(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: UpdateExpenseInput,
): Promise<Result<Expense>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "expenses:cancel");

  const parsed = updateExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const expense = await repo.findExpenseById(organizationId, input.expenseId);
  if (!expense) return { ok: false, code: "NOT_FOUND", message: "Expense not found" };
  if (expense.status !== "RECORDED") {
    return { ok: false, code: "ALREADY_VOIDED", message: `Expense is already ${expense.status}` };
  }
  if (!(await cycleIsOpen(organizationId, expense))) {
    return { ok: false, code: "CYCLE_NOT_OPEN", message: "Expenses of a closed cycle cannot change" };
  }

  const updated = await withTransaction(async (dbSession) => {
    const doc = await repo.replaceExpenseContent(
      organizationId,
      expense.id,
      {
        label: input.label,
        amountMillimes: input.amountMillimes,
        reference: input.reference || null,
        date: input.date,
      },
      dbSession,
    );
    if (!doc) throw new Error("Expense was no longer RECORDED");
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "EXPENSE_UPDATED",
        entityType: "expense",
        entityId: expense.id,
        metadata: { label: doc.label, amountMillimes: doc.amountMillimes },
      },
      dbSession,
    );
    return doc;
  });
  return { ok: true, data: updated };
}

async function voidExpense(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: VoidExpenseInput,
  targetStatus: "CANCELLED" | "REVERSED",
): Promise<Result<Expense>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "expenses:cancel");

  const parsed = voidExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const expense = await repo.findExpenseById(organizationId, parsed.data.expenseId);
  if (!expense) return { ok: false, code: "NOT_FOUND", message: "Expense not found" };
  if (expense.status !== "RECORDED") {
    return { ok: false, code: "ALREADY_VOIDED", message: `Expense is already ${expense.status}` };
  }
  if (!(await cycleIsOpen(organizationId, expense))) {
    return { ok: false, code: "CYCLE_NOT_OPEN", message: "Expenses of a closed cycle cannot change" };
  }

  const updated = await withTransaction(async (dbSession) => {
    const voided = await repo.markExpenseVoided(
      organizationId,
      expense.id,
      targetStatus,
      parsed.data.reason,
      dbSession,
    );
    if (!voided) throw new Error("Expense was no longer RECORDED");

    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: "EXPENSE_CANCELLED",
        entityType: "expense",
        entityId: expense.id,
        metadata: {
          reason: parsed.data.reason,
          targetStatus,
          label: expense.label,
          amountMillimes: expense.amountMillimes,
        },
      },
      dbSession,
    );
    return voided;
  });

  return { ok: true, data: updated };
}

export async function cancelExpense(
  session: AuthorizedSession,
  organizationId: string,
  input: VoidExpenseInput,
): Promise<Result<Expense>> {
  return voidExpense(session, organizationId, input, "CANCELLED");
}

export async function reverseExpense(
  session: AuthorizedSession,
  organizationId: string,
  input: VoidExpenseInput,
): Promise<Result<Expense>> {
  return voidExpense(session, organizationId, input, "REVERSED");
}
