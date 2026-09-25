"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { loginAction, registerAction } from "@/lib/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [onSubmit, pending] = useActionToast(mode === "login" ? loginAction : registerAction, () => {
    router.replace("/residences");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {mode === "register" && (
          <Field label={t.fullName}>
            <IconInput icon="user">
              <input className="input" name="name" autoComplete="name" placeholder={t.fullNamePlaceholder} required />
            </IconInput>
          </Field>
        )}
        <Field label={t.email}>
          <IconInput icon="mail">
            <input
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              required
            />
          </IconInput>
        </Field>
        <Field label={t.password} hint={mode === "register" ? t.passwordHint : undefined}>
          <IconInput icon="lock">
            <input
              className="input pr-12"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : undefined}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="icon-field-toggle"
              aria-label={showPassword ? t.hidePassword : t.showPassword}
              title={showPassword ? t.hidePassword : t.showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
            </button>
          </IconInput>
        </Field>
      </div>
      <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
        {mode === "login" ? t.signIn : t.registerCta}
      </button>
    </form>
  );
}

/** An input with an icon inside it, on the left. */
function IconInput({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className="icon-field">
      <span className="icon-field-icon">
        <Icon name={icon} size={17} />
      </span>
      {children}
    </span>
  );
}
