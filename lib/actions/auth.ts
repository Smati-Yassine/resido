"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { registerUser } from "@/lib/domain/users/service";
import { claimInvitations } from "@/lib/domain/members/service";
import { getDictionary } from "@/lib/i18n/server";
import type { ActionResult } from "@/lib/action-result";

export async function loginAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: t.errInvalidCredentials };
    throw error;
  }
  return { ok: true, message: t.signedIn };
}

export async function registerAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await registerUser({ name: String(formData.get("name") ?? ""), email, password });
  if (!result.ok) {
    if (result.code === "EMAIL_TAKEN") return { ok: false, message: t.errEmailTaken };
    if (result.message === "PASSWORD_TOO_SHORT") return { ok: false, message: t.errPasswordShort };
    return { ok: false, message: t.errRegister };
  }
  // Residences shared with this email before the account existed.
  await claimInvitations(result.data.id, result.data.email);
  await signIn("credentials", { email, password, redirect: false });
  return { ok: true, message: t.accountCreated };
}
