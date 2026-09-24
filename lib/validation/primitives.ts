import { z } from "zod";
import { fromDecimalString, MoneyError, type Millimes } from "@/lib/money";

/** A 24-char hex Mongo ObjectId, as a string (validated, not yet cast to ObjectId). */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");

/**
 * Accepts a decimal-string TND amount (e.g. "518.880") and transforms it
 * into a validated Millimes value. This is the only sanctioned way a money
 * amount enters the system from user input — see docs/06-api-architecture.md
 * and docs/decisions/ADR-004-money-representation.md. Rejects floats.
 */
export const millimesInputSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return fromDecimalString(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof MoneyError ? error.message : "Invalid amount",
      });
      return z.NEVER;
    }
  })
  .pipe(z.custom<Millimes>());

/** A non-negative variant, for fields that can never be negative (assessment amounts, expense amounts). */
export const nonNegativeMillimesInputSchema = millimesInputSchema.refine((v) => v >= 0, {
  message: "Amount must not be negative",
});

export const dateSchema = z.coerce.date();

export const cycleDateRangeSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((v) => v.endDate.getTime() > v.startDate.getTime(), {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const idempotencyKeySchema = z.uuid();

export const emailSchema = z.string().email();

export const nonEmptyStringSchema = z.string().trim().min(1);
