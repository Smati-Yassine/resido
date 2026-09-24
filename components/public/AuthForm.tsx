"use client";

import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { loginAction, registerAction } from "@/lib/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [onSubmit, pending] = useActionToast(mode === "login" ? loginAction : registerAction, () => {
    router.replace("/residences");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        {mode === "register" && (
          <Field label={t.fullName}>
            <input className="input" name="name" autoComplete="name" placeholder={t.fullNamePlaceholder} required />
          </Field>
        )}
        <Field label={t.email}>
          <input
            className="input"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t.emailPlaceholder}
            required
          />
        </Field>
        <Field label={t.password} hint={mode === "register" ? t.passwordHint : undefined}>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            placeholder="••••••••"
            required
          />
        </Field>
      </div>
      <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
        {mode === "login" ? t.signIn : t.registerCta}
      </button>
    </form>
  );
}
