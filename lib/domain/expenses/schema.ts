import { z } from "zod";
import {
  nonEmptyStringSchema,
  objectIdSchema,
  dateSchema,
  idempotencyKeySchema,
  millimesInputSchema,
} from "@/lib/validation/primitives";

export const EXPENSE_STATUSES = ["RECORDED", "CANCELLED", "REVERSED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/**
 * An expense is a label, an amount and an optional reference (cheque
 * number…). No categories: the source spreadsheets list expenses month by
 * month with free-text labels, and that is how they are read back.
 */
export const createExpenseInputSchema = z.object({
  label: nonEmptyStringSchema.max(200),
  amountMillimes: millimesInputSchema.refine((v) => v > 0, { message: "AMOUNT_NOT_POSITIVE" }),
  reference: z.string().trim().max(120).optional(),
  date: dateSchema,
  idempotencyKey: idempotencyKeySchema,
});
// z.input — money/date fields arrive as raw strings from forms.
export type CreateExpenseInput = z.input<typeof createExpenseInputSchema>;

/** Editing replaces an expense's label, amount, reference and date. */
export const updateExpenseInputSchema = createExpenseInputSchema.omit({ idempotencyKey: true }).extend({
  expenseId: objectIdSchema,
});
export type UpdateExpenseInput = z.input<typeof updateExpenseInputSchema>;

export const voidExpenseInputSchema = z.object({
  expenseId: objectIdSchema,
  reason: nonEmptyStringSchema,
});
export type VoidExpenseInput = z.infer<typeof voidExpenseInputSchema>;

export interface Expense {
  id: string;
  organizationId: string;
  cycleId: string;
  label: string;
  amountMillimes: number;
  reference: string | null;
  date: Date;
  status: ExpenseStatus;
  cancelledReason: string | null;
  idempotencyKey: string;
  createdBy: string;
}
