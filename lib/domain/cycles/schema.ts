import { z } from "zod";
import {
  nonEmptyStringSchema,
  objectIdSchema,
  dateSchema,
  nonNegativeMillimesInputSchema,
} from "@/lib/validation/primitives";

export const CYCLE_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/**
 * A cycle has a start and either a fixed end date or none at all: an
 * open-ended cycle runs until someone closes it, and closing stamps the end
 * date. See docs/decisions/ADR-005-cycle-model.md.
 */
export const createCycleInputSchema = z
  .object({
    name: nonEmptyStringSchema.max(80),
    startDate: dateSchema,
    endDate: dateSchema.optional(),
  })
  .refine((v) => !v.endDate || v.endDate.getTime() > v.startDate.getTime(), {
    message: "END_BEFORE_START",
    path: ["endDate"],
  });
// z.input — dates arrive as strings from forms; dateSchema coerces on parse.
export type CreateCycleInput = z.input<typeof createCycleInputSchema>;

export const cycleIdInputSchema = z.object({ cycleId: objectIdSchema });
export type CycleIdInput = z.infer<typeof cycleIdInputSchema>;

/** The treasury "start point" (docs/01-excel-analysis.md, "Solde depart"): the only typed-in treasury figure. */
export const setOpeningBalanceInputSchema = z.object({
  cycleId: objectIdSchema,
  openingTreasuryBalanceMillimes: nonNegativeMillimesInputSchema,
});
export type SetOpeningBalanceInput = z.input<typeof setOpeningBalanceInputSchema>;

export interface Cycle {
  id: string;
  organizationId: string;
  name: string;
  startDate: Date;
  /** Null for an open-ended cycle until it is closed. */
  endDate: Date | null;
  status: CycleStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  createdBy: string;
  closedBy: string | null;
  /** Set when the cycle opens (carried over from the previous cycle's close) and editable until it closes. */
  openingTreasuryBalanceMillimes: number | null;
  /** Snapshotted at close time: opening + income - expenses for the cycle. */
  closingTreasuryBalanceMillimes: number | null;
  previousCycleId: string | null;
  nextCycleId: string | null;
}
