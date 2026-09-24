import { withTransaction } from "@/lib/db/transaction";
import * as membershipsRepo from "@/lib/domain/memberships/repository";
import * as residencesRepo from "@/lib/domain/residences/repository";
import * as users from "@/lib/domain/users/service";

/**
 * Account-level actions on everything a user holds. A residence the user is
 * the only member of is theirs alone and is deleted with all its data; a
 * residence shared with other members is left intact — the user only leaves
 * it (handing admin to another member if they were the only admin). Both
 * actions require the account password again.
 */
export type AccountResult =
  | { ok: true; data: { residencesDeleted: number; residencesLeft: number } }
  | { ok: false; code: "WRONG_PASSWORD" | "NOT_FOUND"; message: string };

async function releaseResidences(userId: string, deleteUser: boolean): Promise<AccountResult> {
  const memberships = await membershipsRepo.listMembershipsForUser(userId);
  // Decided before the transaction: who else is in each residence.
  const shared = new Set<string>();
  for (const m of memberships) {
    if ((await membershipsRepo.countMembers(m.residenceId)) > 1) shared.add(m.residenceId);
  }
  // Leaving a shared residence as its only admin hands admin to the longest-standing other member.
  const successors = new Map<string, string>();
  for (const m of memberships) {
    if (!shared.has(m.residenceId) || m.role !== "SYNDIC_ADMIN") continue;
    const others = (await membershipsRepo.listMembers(m.residenceId)).filter((x) => x.userId !== userId);
    if (!others.some((x) => x.role === "SYNDIC_ADMIN") && others[0]) successors.set(m.residenceId, others[0].userId);
  }
  await withTransaction(async (dbSession) => {
    for (const m of memberships) {
      if (shared.has(m.residenceId)) {
        await membershipsRepo.deleteMembership(userId, m.residenceId, dbSession);
        const successor = successors.get(m.residenceId);
        if (successor) await membershipsRepo.setMemberRole(successor, m.residenceId, "SYNDIC_ADMIN", dbSession);
      } else {
        await residencesRepo.deleteResidenceCascade(m.residenceId, dbSession);
      }
    }
    if (deleteUser) await users.deleteUserDocument(userId, dbSession);
  });
  return { ok: true, data: { residencesDeleted: memberships.length - shared.size, residencesLeft: shared.size } };
}

/** Deletes every residence the user owns alone (and leaves shared ones); the account stays. */
export async function purgeData(userId: string, password: string): Promise<AccountResult> {
  if (!(await users.verifyPassword(userId, password))) {
    return { ok: false, code: "WRONG_PASSWORD", message: "Wrong password" };
  }
  return releaseResidences(userId, false);
}

/** Purges the user's data as above, then deletes the account itself. */
export async function deleteAccount(userId: string, password: string): Promise<AccountResult> {
  if (!(await users.verifyPassword(userId, password))) {
    return { ok: false, code: "WRONG_PASSWORD", message: "Wrong password" };
  }
  return releaseResidences(userId, true);
}
