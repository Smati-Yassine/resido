import { cookies } from "next/headers";
import { DICTIONARIES, LOCALES, type Dictionary, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "resido-lang";
export const THEME_COOKIE = "resido-theme";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export interface Preferences {
  locale: Locale;
  theme: Theme;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

/** The viewer's language and theme, from their preference cookies. */
export async function getPreferences(): Promise<Preferences> {
  const store = await cookies();
  return {
    locale: pick(store.get(LOCALE_COOKIE)?.value, LOCALES, "fr"),
    theme: pick(store.get(THEME_COOKIE)?.value, THEMES, "light"),
  };
}

export async function getDictionary(): Promise<{ t: Dictionary; locale: Locale }> {
  const { locale } = await getPreferences();
  return { t: DICTIONARIES[locale], locale };
}
