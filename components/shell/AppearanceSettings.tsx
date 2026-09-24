"use client";

import { useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { setPreferenceAction } from "@/lib/actions/preferences";
import type { Theme } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/dictionaries";

/** Language and theme. `bare` drops the card frame (e.g. inside the account settings modal). */
export function AppearanceSettings({ theme, bare = false }: { theme: Theme; bare?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const set = (pref: { locale: Locale } | { theme: Theme }) =>
    startTransition(async () => {
      const result = await setPreferenceAction(pref);
      toast({ tone: result.ok ? "success" : "danger", text: result.message });
    });

  return (
    <div className={bare ? "flex flex-col gap-5" : "card card-pad flex max-w-[560px] flex-col gap-5"}>
      <h2 className="h-card">{t.appearance}</h2>
      <div className="flex flex-col gap-2">
        <span id="lang-label" className="text-[13px] font-semibold text-ink-2">
          {t.language}
        </span>
        <div role="group" aria-labelledby="lang-label" className="segmented">
          <button
            type="button"
            className="segment"
            aria-pressed={locale === "fr"}
            disabled={pending}
            onClick={() => set({ locale: "fr" })}
          >
            Français
          </button>
          <button
            type="button"
            className="segment"
            aria-pressed={locale === "en"}
            disabled={pending}
            onClick={() => set({ locale: "en" })}
          >
            English
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span id="theme-label" className="text-[13px] font-semibold text-ink-2">
          {t.theme}
        </span>
        <div role="group" aria-labelledby="theme-label" className="segmented">
          <button
            type="button"
            className="segment"
            aria-pressed={theme === "light"}
            disabled={pending}
            onClick={() => set({ theme: "light" })}
          >
            <Icon name="sun" size={16} strokeWidth={2} />
            {t.light}
          </button>
          <button
            type="button"
            className="segment"
            aria-pressed={theme === "dark"}
            disabled={pending}
            onClick={() => set({ theme: "dark" })}
          >
            <Icon name="moon" size={16} strokeWidth={2} />
            {t.dark}
          </button>
        </div>
      </div>
    </div>
  );
}
