"use client";

import { useState } from "react";
import { setPreferenceAction } from "@/lib/actions/preferences";
import type { Theme } from "@/lib/i18n/server";
import { useToast } from "./Toaster";

/**
 * Light / dark, switched at once: the page takes the new theme immediately
 * (the `data-theme` attribute the CSS tokens key off), and the choice is saved
 * in its cookie in the background — no re-render, so no wait.
 */
export function useThemeSwitch(initial: Theme) {
  const toast = useToast();
  // The page's current theme wins over the server's value, which is not
  // re-rendered after a switch (settings reopened later must show the new one).
  const [theme, setTheme] = useState<Theme>(() => {
    const shown = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme");
    return shown === "light" || shown === "dark" ? shown : initial;
  });
  const switchTo = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    void setPreferenceAction({ theme: next }).then((result) =>
      toast({ tone: result.ok ? "success" : "danger", text: result.message }),
    );
  };
  return [theme, switchTo] as const;
}
