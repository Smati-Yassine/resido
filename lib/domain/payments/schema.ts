import { z } from "zod";
import { objectIdSchema, dateSchema, idempotencyKeySchema, millimesInputSchema } from "@/lib/validation/primitives";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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

export const createPaymentInputSchema = z
  .object({
    /** The owner paying, when the payer is a known owner; `payerName` then snapshots their name. */
    ownerId: objectIdSchema.optional(),
    payerName: z.string().trim().max(120).optional(),
    date: dateSchema,
    method: z.enum(PAYMENT_METHODS),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
    allocations: z.array(paymentAllocationInputSchema).min(1, "NO_ALLOCATION"),
  })
  .refine((v) => new Set(v.allocations.map((a) => a.assessmentId)).size === v.allocations.length, {
    message: "Each assessment can appear at most once per payment",
    path: ["allocations"],
  });
// z.input — money fields arrive as raw decimal strings from forms.
export type CreatePaymentInput = z.input<typeof createPaymentInputSchema>;

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
