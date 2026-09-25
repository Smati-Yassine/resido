import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { writeAuditLog } from "@/lib/audit/log";
import {
  createPaymentInputSchema,
  voidPaymentInputSchema,
  type CreatePaymentInput,
  type VoidPaymentInput,
  type Payment,
} from "./schema";
import * as repo from "./repository";
import { DuplicateIdempotencyKeyError } from "./repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import { OverAllocationError } from "@/lib/domain/assessments/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "CYCLE_NOT_OPEN" | "OVER_ALLOCATION" | "ALREADY_VOIDED" | "CONFLICT";
      message: string;
    };

/**
 * Records a payment: checks every allocation's assessment exists, belongs to
 * an OPEN cycle and would not be overpaid, then atomically applies each
 * allocation and inserts the payment + audit log. Partial allocations are
 * expected — the lot stays PARTIALLY_PAID until a later payment settles it.
 * Idempotent on `idempotencyKey`: a retried submission returns the original
 * payment instead of recording it twice.
 */
export async function recordPayment(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CreatePaymentInput,
): Promise<Result<Payment>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "payments:create");

  const parsed = createPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const existing = await repo.findPaymentByIdempotencyKey(organizationId, input.idempotencyKey);
  if (existing) return { ok: true, data: existing };

  const explicitOwner = input.ownerId ? await ownersRepo.findOwnerById(organizationId, input.ownerId) : null;
  if (input.ownerId && !explicitOwner) return { ok: false, code: "NOT_FOUND", message: "Owner not found" };

  // Best-effort pre-check for a readable error; the $expr-guarded update in
  // applyPaymentToAssessment is the authoritative, race-free overpay guard.
  const resolved: { assessmentId: string; lotId: string; cycleId: string; amountMillimes: number }[] = [];
  for (const allocation of input.allocations) {
    const assessment = await assessmentsRepo.findAssessmentById(organizationId, allocation.assessmentId);
    if (!assessment) {
      return { ok: false, code: "NOT_FOUND", message: `Assessment ${allocation.assessmentId} not found` };
    }
    const cycle = await cyclesRepo.findCycleById(organizationId, assessment.cycleId);
    if (!cycle || cycle.status !== "OPEN") {
      return { ok: false, code: "CYCLE_NOT_OPEN", message: "Payments can only be recorded on the open cycle" };
    }
    const remaining = assessment.amountMillimes - assessment.paidMillimes;
    if (allocation.amountMillimes > remaining) {
      return {
        ok: false,
        code: "OVER_ALLOCATION",
        message: `Allocation of ${allocation.amountMillimes} exceeds the remaining balance (${remaining})`,
      };
    }
    resolved.push({
      assessmentId: assessment.id,
      lotId: assessment.lotId,
      cycleId: assessment.cycleId,
      amountMillimes: allocation.amountMillimes,
    });
  }
  const totalAmountMillimes = resolved.reduce((sum, a) => sum + a.amountMillimes, 0);

  // Who paid, unless given: the owner of the units paid. One owner → the
  // payment is theirs; units of several owners → their names, no owner link.
  let owner = explicitOwner;
  let payerName = input.payerName || null;
  if (!owner) {
    const lots = await lotsRepo.findLotsByIds(organizationId, [...new Set(resolved.map((a) => a.lotId))]);
    const ownerIds = [...new Set(lots.map((l) => l.ownerId).filter((id): id is string => !!id))];
    const lotOwners = (await Promise.all(ownerIds.map((id) => ownersRepo.findOwnerById(organizationId, id)))).filter(
      (o) => o !== null,
    );
    if (lotOwners.length === 1) owner = lotOwners[0];
    else if (lotOwners.length > 1 && !payerName) payerName = lotOwners.map((o) => o.name).join(", ");
  }

  try {
    const payment = await withTransaction(async (dbSession) => {
      for (const allocation of resolved) {
        await assessmentsRepo.applyPaymentToAssessment(
          organizationId,
          allocation.assessmentId,
          allocation.amountMillimes,
          dbSession,
        );
      }
      const doc = await repo.insertPayment(
        organizationId,
        {
          ownerId: owner?.id ?? null,
          payerName: owner?.name ?? payerName,
          date: input.date,
          amountMillimes: totalAmountMillimes,
          method: input.method,
          note: input.note || null,
          idempotencyKey: input.idempotencyKey,
          allocations: resolved,
          createdBy: session.userId,
        },
        dbSession,
      );
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "PAYMENT_CREATED",
          entityType: "payment",
          entityId: doc.id,
          metadata: {
            amountMillimes: totalAmountMillimes,
            allocationCount: resolved.length,
            name: owner?.name ?? payerName,
          },
        },
        dbSession,
      );
      return doc;
    });
    return { ok: true, data: payment };
  } catch (error) {
    if (error instanceof OverAllocationError) {
      return { ok: false, code: "OVER_ALLOCATION", message: error.message };
    }
    if (error instanceof DuplicateIdempotencyKeyError) {
      const retried = await repo.findPaymentByIdempotencyKey(organizationId, input.idempotencyKey);
      if (retried) return { ok: true, data: retried };
      return { ok: false, code: "CONFLICT", message: error.message };
    }
    throw error;
  }
}

export async function listPaymentsForCycle(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Result<Payment[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "payments:read");
  return { ok: true, data: await repo.listPaymentsForCycle(organizationId, cycleId) };
}

async function voidPayment(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: VoidPaymentInput,
  targetStatus: "CANCELLED" | "REVERSED",
): Promise<Result<Payment>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "payments:cancel");

  const parsed = voidPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const payment = await repo.findPaymentById(organizationId, parsed.data.paymentId);
  if (!payment) return { ok: false, code: "NOT_FOUND", message: "Payment not found" };
  if (payment.status !== "COMPLETED") {
    return { ok: false, code: "ALREADY_VOIDED", message: `Payment is already ${payment.status}` };
  }

  const updated = await withTransaction(async (dbSession) => {
    for (const allocation of payment.allocations) {
      await assessmentsRepo.reversePaymentFromAssessment(
        organizationId,
        allocation.assessmentId,
        allocation.amountMillimes,
        dbSession,
      );
    }
    const voided = await repo.markPaymentVoided(
      organizationId,
      payment.id,
      targetStatus,
      parsed.data.reason,
      dbSession,
    );
    if (!voided) throw new Error("Payment was no longer COMPLETED");
    await writeAuditLog(
      {
        organizationId,
        actorUserId: session.userId,
        action: targetStatus === "CANCELLED" ? "PAYMENT_CANCELLED" : "PAYMENT_REVERSED",
        entityType: "payment",
        entityId: payment.id,
        metadata: { reason: parsed.data.reason },
      },
      dbSession,
    );
    return voided;
  });

  return { ok: true, data: updated };
}

/** Data-entry mistake — the payment conceptually never happened. */
export async function cancelPayment(session: AuthorizedSession, organizationId: string, input: VoidPaymentInput) {
  return voidPayment(session, organizationId, input, "CANCELLED");
}

/** The payment did happen and is now being undone (e.g. a bounced cheque). */
export async function reversePayment(session: AuthorizedSession, organizationId: string, input: VoidPaymentInput) {
  return voidPayment(session, organizationId, input, "REVERSED");
}
