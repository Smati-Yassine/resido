"use client";

import { useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { setPreferenceAction } from "@/lib/actions/preferences";
import type { Theme } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * Light / dark switch and language select for signed-out pages, beside the
 * brand or above the sign-in card (signed-in users have them in Settings ›
 * General).
 */
export function PublicPreferences({ theme }: { theme: Theme }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const set = (pref: { locale: Locale } | { theme: Theme }) =>
    startTransition(async () => {
      const result = await setPreferenceAction(pref);
      toast({ tone: result.ok ? "success" : "danger", text: result.message });
    });
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? t.dark : t.light;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="icon-btn"
        aria-label={`${t.theme} — ${label}`}
        title={`${t.theme} — ${label}`}
        disabled={pending}
        onClick={() => set({ theme: next })}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      </button>
      <select
        className="input h-10 w-auto py-0 pr-9 text-sm font-semibold"
        aria-label={t.language}
        value={locale}
        disabled={pending}
        onChange={(event) => set({ locale: event.target.value as Locale })}
      >
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
