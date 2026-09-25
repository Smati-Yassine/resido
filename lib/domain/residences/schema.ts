import { z } from "zod";
import { nonEmptyStringSchema } from "@/lib/validation/primitives";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currency";

/**
 * A residence is the tenant: every lot, cycle, payment and expense belongs to
 * exactly one. It is persisted in the `organizations` collection and every
 * tenant-scoped document carries it as `organizationId` — the storage names
 * predate the product vocabulary and are kept to avoid a data migration.
 */
export const RESIDENCE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ResidenceStatus = (typeof RESIDENCE_STATUSES)[number];

export const residenceInputSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  city: z.string().trim().max(120).default(""),
  /** Only read at creation; later changes go through setResidenceCurrency. */
  currency: z
    .string()
    .refine(isCurrencyCode)
    .transform((v) => v as CurrencyCode)
    .optional(),
});
export type ResidenceInput = z.input<typeof residenceInputSchema>;

export interface Residence {
  id: string;
  name: string;
  city: string;
  /** Its URL key (`/residences/<slug>`), from the name; unique, and changes when it is renamed. */
  slug: string;
  status: ResidenceStatus;
  /** What the residence keeps its books in — display and input precision only (lib/currency). */
  currency: CurrencyCode;
  createdAt: Date;
  updatedAt: Date;
}
