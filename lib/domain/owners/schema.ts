import { z } from "zod";
import { nonEmptyStringSchema, objectIdSchema } from "@/lib/validation/primitives";

/**
 * A lot owner (copropriétaire). An owner can hold several lots, and a lot can
 * have several owners (co-ownership). Paying for an owner settles the lots
 * they hold.
 */
export const ownerInputSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  phone: z.string().trim().max(40).optional(),
  /** The full set of lots this owner holds after the save. */
  lotIds: z.array(objectIdSchema).default([]),
  /**
   * Among `lotIds`, the lots owned by someone else that this owner joins as a
   * co-owner; the others are handed over (their previous owners leave them).
   */
  shareLotIds: z.array(objectIdSchema).default([]),
});
export type OwnerInput = z.input<typeof ownerInputSchema>;

export interface Owner {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  /**
   * Removed from the present but still named by past cycles: shown only where
   * they own lots (an older cycle), hidden elsewhere.
   */
  removed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
