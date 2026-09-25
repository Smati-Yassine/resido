import { z } from "zod";
import { objectIdSchema, dateSchema, idempotencyKeySchema, millimesInputSchema } from "@/lib/validation/primitives";
import { PAYMENT_METHODS, type PaymentMethod } from "./methods";

export { PAYMENT_METHODS, type PaymentMethod };

export const PAYMENT_STATUSES = ["COMPLETED", "CANCELLED", "REVERSED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const positiveMillimesInputSchema = millimesInputSchema.refine((v) => v > 0, {
  message: "AMOUNT_NOT_POSITIVE",
});

/**
 * One payment can settle several lots, each fully or partly: an allocation
 * smaller than the lot's remaining due leaves it PARTIALLY_PAID, to be
 * completed by a later payment.
 */
export const paymentAllocationInputSchema = z.object({
  assessmentId: objectIdSchema,
  amountMillimes: positiveMillimesInputSchema,
});

const paymentFields = {
  /** The owner paying, when the payer is a known owner; `payerName` then snapshots their name. */
  ownerId: objectIdSchema.optional(),
  payerName: z.string().trim().max(120).optional(),
  date: dateSchema,
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500).optional(),
  allocations: z.array(paymentAllocationInputSchema).min(1, "NO_ALLOCATION"),
};

const distinctAllocations = <T extends { allocations: { assessmentId: string }[] }>(v: T) =>
  new Set(v.allocations.map((a) => a.assessmentId)).size === v.allocations.length;
const DISTINCT_MESSAGE = { message: "Each assessment can appear at most once per payment", path: ["allocations"] };

export const createPaymentInputSchema = z
  .object({ ...paymentFields, idempotencyKey: idempotencyKeySchema })
  .refine(distinctAllocations, DISTINCT_MESSAGE);
// z.input — money fields arrive as raw decimal strings from forms.
export type CreatePaymentInput = z.input<typeof createPaymentInputSchema>;

/** Editing replaces the payment's date, method, note and allocations as a whole. */
export const updatePaymentInputSchema = z
  .object({ ...paymentFields, paymentId: objectIdSchema })
  .refine(distinctAllocations, DISTINCT_MESSAGE);
export type UpdatePaymentInput = z.input<typeof updatePaymentInputSchema>;

export const voidPaymentInputSchema = z.object({
  paymentId: objectIdSchema,
  reason: z.string().trim().min(1),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentInputSchema>;

export interface PaymentAllocation {
  assessmentId: string;
  lotId: string;
  cycleId: string;
  amountMillimes: number;
}

export interface Payment {
  id: string;
  organizationId: string;
  ownerId: string | null;
  payerName: string | null;
  date: Date;
  amountMillimes: number;
  method: PaymentMethod;
  note: string | null;
  status: PaymentStatus;
  cancelledReason: string | null;
  idempotencyKey: string;
  allocations: PaymentAllocation[];
  createdBy: string;
}
