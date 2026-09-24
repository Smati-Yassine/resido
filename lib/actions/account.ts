"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import * as account from "@/lib/domain/account/service";
import * as users from "@/lib/domain/users/service";
import { claimInvitations } from "@/lib/domain/members/service";
import type { ActionResult } from "@/lib/action-result";
import { field } from "./errors";

export async function purgeDataAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const user = await requireUser();
  const result = await account.purgeData(user.userId, String(formData.get("password") ?? ""));
  if (!result.ok) return { ok: false, message: t.errWrongPassword };
  revalidatePath("/residences");
  return { ok: true, message: interpolate(t.dataPurged, { count: result.data.residencesDeleted }) };
}

export async function deleteAccountAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const user = await requireUser();
  if (field(formData, "confirm").toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, message: t.errConfirmEmail };
  }
  const result = await account.deleteAccount(user.userId, String(formData.get("password") ?? ""));
  if (!result.ok) return { ok: false, message: t.errWrongPassword };
  await signOut({ redirect: false });
  return { ok: true, message: t.accountDeleted };
}

export async function updateProfileAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const user = await requireUser();
  const result = await users.updateProfile(user.userId, {
    name: field(formData, "name"),
    email: field(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) {
    const message =
      result.code === "WRONG_PASSWORD"
        ? t.errWrongPassword
        : result.code === "EMAIL_TAKEN"
          ? t.errEmailTaken
          : t.errRegister;
    return { ok: false, message };
  }
  if (result.data.email !== user.email) await claimInvitations(user.userId, result.data.email);
  revalidatePath("/", "layout");
  return { ok: true, message: t.profileSaved };
}

/**
 * Changing the password ends every session (sessionVersion bump); this
 * device is signed straight back in with the new password so only the
 * others are logged out.
 */
export async function changePasswordAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const user = await requireUser();
  const next = String(formData.get("newPassword") ?? "");
  if (next !== String(formData.get("confirmPassword") ?? "")) return { ok: false, message: t.errPasswordMismatch };
  const result = await users.changePassword(user.userId, String(formData.get("currentPassword") ?? ""), next);
  if (!result.ok) {
    return { ok: false, message: result.code === "PASSWORD_TOO_SHORT" ? t.errPasswordShort : t.errWrongPassword };
  }
  await signIn("credentials", { email: result.data.email, password: next, redirect: false });
  return { ok: true, message: t.passwordChanged };
}

export async function endAllSessionsAction(): Promise<ActionResult> {
  const { t } = await getDictionary();
  const user = await requireUser();
  await users.endAllSessions(user.userId);
  await signOut({ redirect: false });
  return { ok: true, message: t.allSessionsEnded };
}
