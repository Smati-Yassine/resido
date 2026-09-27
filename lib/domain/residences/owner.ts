import * as repo from "./repository";
import * as membershipsRepo from "@/lib/domain/memberships/repository";
import type { Residence } from "./schema";

/**
 * The owner of a residence: the user who created it. When none is recorded
 * (residences created before it was), or the recorded one is no longer a
 * member (they deleted their account), the longest-standing administrator
 * takes it — and keeps it from then on.
 */
export async function residenceOwnerId(residence: Pick<Residence, "id" | "ownerUserId">): Promise<string | null> {
  if (residence.ownerUserId && (await membershipsRepo.findMembership(residence.ownerUserId, residence.id))) {
    return residence.ownerUserId;
  }
  const first = (await membershipsRepo.listMembers(residence.id)).find((m) => m.role === "SYNDIC_ADMIN");
  if (!first) return null;
  await repo.setOwner(residence.id, first.userId);
  return first.userId;
}

/** Whether `userId` owns the residence. */
export async function isResidenceOwner(residenceId: string, userId: string): Promise<boolean> {
  const residence = await repo.findResidenceById(residenceId);
  return !!residence && (await residenceOwnerId(residence)) === userId;
}
