"use client";

import { useTransition } from "react";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { setPreferenceAction } from "@/lib/actions/preferences";
import type { Locale } from "@/lib/i18n/dictionaries";

/** FR / EN switch for signed-out visitors (signed-in users have it in Settings › Appearance). */
export function LanguageToggle() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const set = (next: Locale) =>
    startTransition(async () => {
      const result = await setPreferenceAction({ locale: next });
      toast({ tone: result.ok ? "success" : "danger", text: result.message });
    });
  return (
    <div role="group" aria-label={t.language} className="segmented segmented-sm">
      {(["fr", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          className="segment"
          aria-pressed={locale === code}
          disabled={pending}
          onClick={() => set(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
