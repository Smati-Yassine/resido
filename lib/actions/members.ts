"use server";

import { revalidatePath } from "next/cache";
import { interpolate } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/server";
import { requireResidenceSession } from "@/lib/session";
import * as members from "@/lib/domain/members/service";
import type { ActionResult } from "@/lib/action-result";
import { field, guarded } from "./errors";

function refresh() {
  revalidatePath("/residences/[residenceId]", "layout");
  revalidatePath("/residences");
}

export async function addMemberAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const residenceId = field(formData, "residenceId");
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  const email = field(formData, "email").toLowerCase();
  const role = field(formData, "role");
  return guarded(t, async () => {
    const result = await members.addMember(session, residenceId, { email, role });
    if (!result.ok) {
      if (result.code === "ALREADY_MEMBER") return { ok: false, message: interpolate(t.errAlreadyMember, { email }) };
      return { ok: false, message: t.errMemberEmail };
    }
    refresh();
    const roleLabel = (t as Record<string, string>)[`role${role}`] ?? role;
    return {
      ok: true,
      message:
        result.data.kind === "added"
          ? interpolate(t.memberAdded, { email, role: roleLabel })
          : interpolate(t.memberInvited, { email }),
    };
  });
}

export async function changeRoleAction(
  residenceId: string,
  member: { userId: string; name: string },
  role: string,
): Promise<ActionResult> {
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  return guarded(t, async () => {
    const result = await members.changeRole(session, residenceId, member.userId, role);
    if (!result.ok) return { ok: false, message: result.code === "LAST_ADMIN" ? t.errLastAdmin : t.errGeneric };
    refresh();
    const roleLabel = (t as Record<string, string>)[`role${result.data.role}`];
    return { ok: true, message: interpolate(t.memberRoleChanged, { name: member.name, role: roleLabel }) };
  });
}

/** Removes a member — or, when the member is the caller, leaves the residence. */
export async function removeMemberAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const residenceId = field(formData, "residenceId");
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  const userId = field(formData, "userId");
  return guarded(t, async () => {
    const result = await members.removeMember(session, residenceId, userId);
    if (!result.ok) return { ok: false, message: result.code === "LAST_ADMIN" ? t.errLastAdmin : t.errGeneric };
    refresh();
    return {
      ok: true,
      message:
        userId === session.userId ? t.leftResidence : interpolate(t.memberRemoved, { name: field(formData, "name") }),
    };
  });
}

export async function cancelInvitationAction(residenceId: string, invitationId: string): Promise<ActionResult> {
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  return guarded(t, async () => {
    const result = await members.cancelInvitation(session, residenceId, invitationId);
    if (!result.ok) return { ok: false, message: t.errGeneric };
    refresh();
    return { ok: true, message: t.invitationCancelled };
  });
}
