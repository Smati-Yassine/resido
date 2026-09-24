"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { DICTIONARIES, interpolate, LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE, THEME_COOKIE, THEMES, type Theme } from "@/lib/i18n/server";
import type { ActionResult } from "@/lib/action-result";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Stores a language / theme preference in a cookie and re-renders so the server applies it (no flash). */
export async function setPreferenceAction(pref: { locale: Locale } | { theme: Theme }): Promise<ActionResult> {
  const store = await cookies();
  const options = { maxAge: ONE_YEAR, path: "/", sameSite: "lax" as const };
  let locale = (store.get(LOCALE_COOKIE)?.value as Locale) ?? "fr";
  if (!LOCALES.includes(locale)) locale = "fr";

  if ("locale" in pref) {
    if (!LOCALES.includes(pref.locale)) return { ok: false, message: DICTIONARIES[locale].errGeneric };
    store.set(LOCALE_COOKIE, pref.locale, options);
    revalidatePath("/", "layout");
    return { ok: true, message: DICTIONARIES[pref.locale].languageSaved };
  }
  if (!THEMES.includes(pref.theme)) return { ok: false, message: DICTIONARIES[locale].errGeneric };
  store.set(THEME_COOKIE, pref.theme, options);
  revalidatePath("/", "layout");
  const t = DICTIONARIES[locale];
  return { ok: true, message: interpolate(t.themeSaved, { theme: pref.theme === "dark" ? t.dark : t.light }) };
}

export async function signOutAction(): Promise<ActionResult> {
  const store = await cookies();
  const locale = (store.get(LOCALE_COOKIE)?.value as Locale) ?? "fr";
  await signOut({ redirect: false });
  return { ok: true, message: (DICTIONARIES[locale] ?? DICTIONARIES.fr).signedOut };
}
