import { roleHasPermission, type AuthorizedSession } from "@/lib/rbac/permissions";
import * as owners from "@/lib/domain/owners/service";
import type { LotRow } from "@/lib/domain/overview/service";
import type { OutstandingLot } from "@/components/workspace/PaymentModal";

/** Lots that still owe something — the choices offered in the payment modal. */
export function outstandingLots(rows: LotRow[]): OutstandingLot[] {
  return rows
    .filter((r) => r.status !== "PAID")
    .map((r) => ({
      assessmentId: r.assessmentId,
      code: r.code,
      bloc: r.blocName,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      remainingMillimes: r.dueMillimes - r.paidMillimes,
      partlyPaid: r.status === "PARTIAL",
    }));
}

/** The residence's owners as dropdown options (empty if the role cannot see owners). */
export async function ownerOptions(
  session: AuthorizedSession,
  residenceId: string,
): Promise<{ id: string; name: string }[]> {
  if (!roleHasPermission(session.role, "owners:read")) return [];
  const result = await owners.listOwners(session, residenceId);
  return result.ok ? result.data.map((o) => ({ id: o.id, name: o.name })) : [];
}
