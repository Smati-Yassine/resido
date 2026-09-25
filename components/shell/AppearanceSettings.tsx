"use client";

import { useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { setPreferenceAction } from "@/lib/actions/preferences";
import { useThemeSwitch } from "@/components/ui/useThemeSwitch";
import { Group, Row } from "@/components/settings/SettingsParts";
import type { Theme } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/dictionaries";

/** Language and theme, as two settings rows. */
export function AppearanceSettings({ theme: initialTheme }: { theme: Theme }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [theme, switchTheme] = useThemeSwitch(initialTheme);

  const set = (pref: { locale: Locale }) =>
    startTransition(async () => {
      const result = await setPreferenceAction(pref);
      toast({ tone: result.ok ? "success" : "danger", text: result.message });
    });

  return (
    <Group title={t.appearance} text={t.navAppearanceDesc}>
      <Row title={t.language} text={t.languageHelp}>
        <div role="group" aria-label={t.language} className="segmented">
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
      </Row>
      <Row title={t.theme} text={t.themeHelp}>
        <div role="group" aria-label={t.theme} className="segmented">
          <button
            type="button"
            className="segment"
            aria-pressed={theme === "light"}
            onClick={() => switchTheme("light")}
          >
            <Icon name="sun" size={16} strokeWidth={2} />
            {t.light}
          </button>
          <button type="button" className="segment" aria-pressed={theme === "dark"} onClick={() => switchTheme("dark")}>
            <Icon name="moon" size={16} strokeWidth={2} />
            {t.dark}
          </button>
        </div>
      </Row>
    </Group>
  );
}
