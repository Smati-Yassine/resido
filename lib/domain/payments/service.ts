import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { writeAuditLog } from "@/lib/audit/log";
import {
  createPaymentInputSchema,
  voidPaymentInputSchema,
  updatePaymentInputSchema,
  type CreatePaymentInput,
  type UpdatePaymentInput,
  type VoidPaymentInput,
  type Payment,
} from "./schema";
import * as repo from "./repository";
import { DuplicateIdempotencyKeyError } from "./repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import { OverAllocationError } from "@/lib/domain/assessments/repository";
import { effectiveOwnerId } from "@/lib/domain/assessments/schema";
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

type ResolvedAllocation = { assessmentId: string; lotId: string; cycleId: string; amountMillimes: number };

/**
 * Checks every allocation's assessment exists, belongs to a billed (OPEN or
 * CLOSED — a closed cycle stays correctable) cycle and would not be overpaid. `credit` is what the payment being edited already
 * pays per assessment — that part is freed again before the new amounts
 * apply. Best-effort, for a readable error: the $expr-guarded update in
 * applyPaymentToAssessment is the authoritative, race-free overpay guard.
 */
async function resolveAllocations(
  organizationId: string,
  allocations: { assessmentId: string; amountMillimes: number }[],
  credit: Map<string, number> = new Map(),
): Promise<Result<ResolvedAllocation[]>> {
  const resolved: ResolvedAllocation[] = [];
  for (const allocation of allocations) {
    const assessment = await assessmentsRepo.findAssessmentById(organizationId, allocation.assessmentId);
    if (!assessment) {
      return { ok: false, code: "NOT_FOUND", message: `Assessment ${allocation.assessmentId} not found` };
    }
    const cycle = await cyclesRepo.findCycleById(organizationId, assessment.cycleId);
    if (!cycle || cycle.status === "DRAFT") {
      return { ok: false, code: "CYCLE_NOT_OPEN", message: "Payments go to a billed cycle" };
    }
    const remaining = assessment.amountMillimes - assessment.paidMillimes + (credit.get(assessment.id) ?? 0);
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
  return { ok: true, data: resolved };
}

/**
 * Who paid, unless given: who owned the units paid in their cycle. One
 * owner → the payment is theirs; several → their names, no owner link.
 */
async function resolvePayer(
  organizationId: string,
  resolved: ResolvedAllocation[],
  ownerId?: string,
  givenName?: string,
): Promise<Result<{ owner: { id: string; name: string } | null; payerName: string | null }>> {
  if (ownerId) {
    const owner = await ownersRepo.findOwnerById(organizationId, ownerId);
    if (!owner) return { ok: false, code: "NOT_FOUND", message: "Owner not found" };
    return { ok: true, data: { owner, payerName: owner.name } };
  }
  const lots = await lotsRepo.findLotsByIds(organizationId, [...new Set(resolved.map((a) => a.lotId))]);
  const lotOwner = new Map(lots.map((l) => [l.id, l.ownerId]));
  const assessments = await Promise.all(
    resolved.map((a) => assessmentsRepo.findAssessmentById(organizationId, a.assessmentId)),
  );
  const ownerIds = [
    ...new Set(
      assessments
        .map((a) => (a ? effectiveOwnerId(a, lotOwner.get(a.lotId) ?? null) : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const owners = (await Promise.all(ownerIds.map((id) => ownersRepo.findOwnerById(organizationId, id)))).filter(
    (o) => o !== null,
  );
  if (owners.length === 1) return { ok: true, data: { owner: owners[0], payerName: owners[0].name } };
  const payerName = givenName || (owners.length > 1 ? owners.map((o) => o.name).join(", ") : null);
  return { ok: true, data: { owner: null, payerName } };
}

/**
 * Records a payment: checks every allocation's assessment exists, belongs to
 * a billed cycle and would not be overpaid, then atomically applies each
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

  const resolved = await resolveAllocations(organizationId, input.allocations);
  if (!resolved.ok) return resolved;
  const payer = await resolvePayer(organizationId, resolved.data, input.ownerId, input.payerName);
  if (!payer.ok) return payer;
  const { owner, payerName } = payer.data;
  const totalAmountMillimes = resolved.data.reduce((sum, a) => sum + a.amountMillimes, 0);

  try {
    const payment = await withTransaction(async (dbSession) => {
      for (const allocation of resolved.data) {
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
          allocations: resolved.data,
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
            allocationCount: resolved.data.length,
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

/**
 * Edits a payment: its date, method, note and allocations are replaced as a
 * whole. In one transaction the old allocations are taken back off their
 * units and the new ones applied, so no unit is ever over- or under-counted.
 * Closed cycles too: their treasury, and the start of the next, follow.
 */
export async function updatePayment(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: UpdatePaymentInput,
): Promise<Result<Payment>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "payments:cancel");

  const parsed = updatePaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const payment = await repo.findPaymentById(organizationId, input.paymentId);
  if (!payment) return { ok: false, code: "NOT_FOUND", message: "Payment not found" };
  if (payment.status !== "COMPLETED") {
    return { ok: false, code: "ALREADY_VOIDED", message: `Payment is already ${payment.status}` };
  }
  const credit = new Map(payment.allocations.map((a) => [a.assessmentId, a.amountMillimes]));
  const resolved = await resolveAllocations(organizationId, input.allocations, credit);
  if (!resolved.ok) return resolved;
  const payer = await resolvePayer(organizationId, resolved.data, input.ownerId, input.payerName);
  if (!payer.ok) return payer;
  const totalAmountMillimes = resolved.data.reduce((sum, a) => sum + a.amountMillimes, 0);

  try {
    const updated = await withTransaction(async (dbSession) => {
      for (const allocation of payment.allocations) {
        await assessmentsRepo.reversePaymentFromAssessment(
          organizationId,
          allocation.assessmentId,
          allocation.amountMillimes,
          dbSession,
        );
      }
      for (const allocation of resolved.data) {
        await assessmentsRepo.applyPaymentToAssessment(
          organizationId,
          allocation.assessmentId,
          allocation.amountMillimes,
          dbSession,
        );
      }
      const doc = await repo.replacePaymentContent(
        organizationId,
        payment.id,
        {
          ownerId: payer.data.owner?.id ?? null,
          payerName: payer.data.payerName,
          date: input.date,
          amountMillimes: totalAmountMillimes,
          method: input.method,
          note: input.note || null,
          allocations: resolved.data,
        },
        dbSession,
      );
      if (!doc) throw new Error("Payment was no longer COMPLETED");
      await writeAuditLog(
        {
          organizationId,
          actorUserId: session.userId,
          action: "PAYMENT_UPDATED",
          entityType: "payment",
          entityId: payment.id,
          metadata: { amountMillimes: totalAmountMillimes, name: payer.data.payerName },
        },
        dbSession,
      );
      return doc;
    });
    return { ok: true, data: updated };
  } catch (error) {
    if (error instanceof OverAllocationError) {
      return { ok: false, code: "OVER_ALLOCATION", message: error.message };
    }
    throw error;
  }
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
        metadata: { reason: parsed.data.reason, amountMillimes: payment.amountMillimes, name: payment.payerName },
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
