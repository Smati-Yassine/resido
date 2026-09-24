import { z } from "zod";
import { nonEmptyStringSchema, objectIdSchema } from "@/lib/validation/primitives";

/**
 * A lot owner (copropriétaire). An owner can hold several lots; a lot has at
 * most one owner. Paying for an owner settles the lots they hold.
 */
export const ownerInputSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  phone: z.string().trim().max(40).optional(),
  /** The full set of lots this owner holds after the save. */
  lotIds: z.array(objectIdSchema).default([]),
});
export type OwnerInput = z.input<typeof ownerInputSchema>;

export interface Owner {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}
