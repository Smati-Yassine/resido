"use client";

import { useState } from "react";
import { useI18n } from "@/components/ui/I18nProvider";
import { AuthForm } from "./AuthForm";

/** Sign in / create an account: a pill switch on top, the form, then a line to switch the other way. */
export function AuthPanel() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const other = mode === "login" ? "register" : "login";
  return (
    <div className="auth-card">
      <div className="segmented w-full" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            className="segment flex-1 justify-center"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
          >
            {m === "login" ? t.signIn : t.register}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="display text-[32px]">{mode === "login" ? t.signInTitle : t.registerTitle}</h2>
        <p className="auth-card-sub text-[15px] text-muted">
          {mode === "login" ? t.signInSubtitle : t.registerSubtitle}
        </p>
      </div>
      <AuthForm key={mode} mode={mode} />
      <p className="text-center text-sm text-muted">
        {mode === "login" ? t.noAccountYet : t.haveAccount}{" "}
        <button type="button" className="btn-link font-semibold" onClick={() => setMode(other)}>
          {other === "login" ? t.signIn : t.register}
        </button>
      </p>
    </div>
  );
}
