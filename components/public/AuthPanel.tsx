"use client";

import { useState } from "react";
import { useI18n } from "@/components/ui/I18nProvider";
import { AuthForm } from "./AuthForm";

/** Sign in / create account, switched by tabs on the same page. */
export function AuthPanel() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-7">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={mode === "login"}
          onClick={() => setMode("login")}
        >
          {t.signIn}
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={mode === "register"}
          onClick={() => setMode("register")}
        >
          {t.register}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="display text-[32px]">{mode === "login" ? t.signInTitle : t.registerTitle}</h2>
        <p className="text-[15px] text-muted">{mode === "login" ? t.signInSubtitle : t.registerSubtitle}</p>
      </div>
      <AuthForm key={mode} mode={mode} />
    </div>
  );
}
