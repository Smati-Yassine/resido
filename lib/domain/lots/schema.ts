import { z } from "zod";
import { nonEmptyStringSchema, objectIdSchema, millimesInputSchema } from "@/lib/validation/primitives";

/**
 * A lot is billed a fixed annual charge. Each cycle snapshots that charge
 * into an assessment when it opens (or when the lot is added to an open
 * cycle) — see lib/domain/cycles/service#openCycle.
 */
export const createLotInputSchema = z.object({
  buildingId: objectIdSchema,
  ownerId: objectIdSchema.optional(),
  code: nonEmptyStringSchema.max(40),
  chargeMillimes: millimesInputSchema.refine((v) => v > 0, { message: "CHARGE_NOT_POSITIVE" }),
});
// z.input — chargeMillimes arrives as a decimal string ("1209.760").
export type CreateLotInput = z.input<typeof createLotInputSchema>;

export interface Lot {
  id: string;
  organizationId: string;
  buildingId: string | null;
  ownerId: string | null;
  code: string;
  chargeMillimes: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

export const setLotOwnerInputSchema = z.object({
  lotId: objectIdSchema,
  ownerId: objectIdSchema.nullable(),
});
export type SetLotOwnerInput = z.infer<typeof setLotOwnerInputSchema>;
