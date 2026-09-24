import { z } from "zod";
import { nonEmptyStringSchema } from "@/lib/validation/primitives";

/** A bloc (building, wing, "RDC"…) groups a residence's lots. */
export const createBuildingInputSchema = z.object({
  name: nonEmptyStringSchema.max(60),
});
export type CreateBuildingInput = z.infer<typeof createBuildingInputSchema>;

export interface Building {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
