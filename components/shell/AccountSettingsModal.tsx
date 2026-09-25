"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { AppearanceSettings } from "./AppearanceSettings";
import { ModalActions } from "@/components/workspace/ModalActions";
import {
  changePasswordAction,
  deleteAccountAction,
  endAllSessionsAction,
  purgeDataAction,
  updateProfileAction,
} from "@/lib/actions/account";
import { interpolate } from "@/lib/i18n/dictionaries";
import type { Theme } from "@/lib/i18n/server";

export interface ExportableResidence {
  id: string;
  name: string;
}

type Tab = "general" | "profile" | "security" | "data";
type Confirm = "purge" | "delete" | null;

interface AccountUser {
  name: string;
  email: string;
}

type Section = { key: Tab; icon: IconName; label: string; desc: string };

/**
 * Account-wide settings, opened from the user menu — a fixed-size panel with a
 * side navigation: General (appearance), Profile, Security, Data. A purge or
 * account deletion is confirmed in a modal on top.
 */
export function AccountSettingsModal({
  user,
  theme,
  residences,
  onClose,
}: {
  user: AccountUser;
  theme: Theme;
  residences: ExportableResidence[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("general");
  const [confirm, setConfirm] = useState<Confirm>(null);

  const sections: Section[] = [
    { key: "general", icon: "sun", label: t.tabGeneral, desc: t.navAppearanceDesc },
    { key: "profile", icon: "user", label: t.profile, desc: t.navProfileDesc },
    { key: "security", icon: "lock", label: t.navSecurity, desc: t.navSecurityDesc },
    { key: "data", icon: "archive", label: t.navData, desc: t.navDataDesc },
  ];

  return (
    <Modal title={t.settings} subtitle={user.email} size="panel" icon="settings" onClose={onClose}>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t.settings}>
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              className="settings-nav-item"
              aria-current={tab === s.key ? "page" : undefined}
              onClick={() => setTab(s.key)}
            >
              <span className="settings-nav-icon">
                <Icon name={s.icon} size={18} />
              </span>
              <span>
                <span className="settings-nav-label">{s.label}</span>
                <span className="settings-nav-desc">{s.desc}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {tab === "general" && (
            <section className="card card-pad">
              <AppearanceSettings theme={theme} bare />
            </section>
          )}
          {tab === "profile" && (
            <section className="card card-pad">
              <ProfileForm user={user} />
            </section>
          )}
          {tab === "security" && (
            <section className="card card-pad">
              <SecurityPanel />
            </section>
          )}
          {tab === "data" && (
            <>
              <section className="card card-pad">
                <ExportSection residences={residences} />
              </section>
              <section className="card card-pad card-danger flex flex-col gap-4">
                <h3 className="h-card text-danger">{t.dangerZone}</h3>
                <DangerRow title={t.purgeTitle} text={t.purgeText}>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm("purge")}>
                    {t.purgeCta}
                  </button>
                </DangerRow>
                <DangerRow title={t.deleteAccountTitle} text={t.deleteAccountText}>
                  <button type="button" className="btn btn-danger-solid btn-sm" onClick={() => setConfirm("delete")}>
                    {t.deleteAccountCta}
                  </button>
                </DangerRow>
              </section>
            </>
          )}
        </div>
      </div>
      {confirm && (
        <DangerConfirm kind={confirm} email={user.email} onCancel={() => setConfirm(null)} onDone={onClose} />
      )}
    </Modal>
  );
}

function DangerRow({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-[13px] text-muted">{text}</span>
      </div>
      {children}
    </div>
  );
}

/** Name and email; a new email also asks for the current password. */
function ProfileForm({ user }: { user: AccountUser }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState(user.email);
  const [onSubmit, pending] = useActionToast(updateProfileAction, () => router.refresh());
  const emailChanged = email.trim().toLowerCase() !== user.email;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h3 className="h-card">{t.profile}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.fullName}>
          <input className="input" name="name" defaultValue={user.name} autoComplete="name" required />
        </Field>
        <Field label={t.email}>
          <input
            className="input"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
      </div>
      {emailChanged && (
        <Field label={t.currentPassword} hint={t.emailChangeNeedsPassword}>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </Field>
      )}
      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {t.saveProfile}
      </button>
    </form>
  );
}

/** Change password (keeps this device signed in) and sign out every device. */
function SecurityPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [onSubmit, pending] = useActionToast(changePasswordAction, () => {
    setFormKey((k) => k + 1);
    router.refresh();
  });
  const [ending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="h-card">{t.changePassword}</h3>
          <p className="text-[13px] text-muted">{t.passwordChangeHelp}</p>
        </div>
        <Field label={t.currentPassword}>
          <input className="input" name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t.newPassword} hint={t.passwordHint}>
            <input
              className="input"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label={t.confirmPassword}>
            <input
              className="input"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary self-start" disabled={pending}>
          {t.changePassword}
        </button>
      </form>
      <div className="divider" />
      <DangerRow title={t.sessionsTitle} text={t.sessionsText}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={ending}
          onClick={() =>
            startTransition(async () => {
              const result = await endAllSessionsAction();
              toast({ tone: "info", text: result.message });
              router.replace("/");
              router.refresh();
            })
          }
        >
          <Icon name="logout" size={16} />
          {t.endAllSessions}
        </button>
      </DangerRow>
    </div>
  );
}

function ExportSection({ residences }: { residences: ExportableResidence[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The route answers with an attachment, so a download link fetches the file without leaving the page.
  const download = (ids: string[] | null) => {
    toast({ tone: "info", text: t.exportStarted });
    const link = document.createElement("a");
    link.href = `/api/exports/account${ids ? `?ids=${ids.join(",")}` : ""}`;
    link.download = "";
    link.click();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="h-card">{t.exportTitle}</h3>
        <p className="text-[13px] text-muted">{t.exportText}</p>
      </div>
      {residences.length === 0 ? (
        <p className="text-sm text-muted">{t.exportNone}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {residences.map((r) => {
              const on = picked.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className="choice flex-row items-center gap-2.5 px-3 py-2.5"
                  aria-pressed={on}
                  onClick={() => toggle(r.id)}
                >
                  <span className="check pointer-events-none h-5 w-5 rounded-md" data-on={on}>
                    {on && <Icon name="check" size={12} strokeWidth={3} />}
                  </span>
                  <span className="choice-title truncate">{r.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => download(null)}>
              {t.exportAll}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={picked.size === 0}
              onClick={() => download([...picked])}
            >
              {interpolate(t.exportSelected, { count: picked.size })}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Password-confirmed purge / account deletion. Deleting also asks for the email, typed out. */
function DangerConfirm({
  kind,
  email,
  onCancel,
  onDone,
}: {
  kind: "purge" | "delete";
  email: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [onSubmit, pending] = useActionToast(kind === "purge" ? purgeDataAction : deleteAccountAction, () => {
    onDone();
    if (kind === "delete") router.replace("/");
    router.refresh();
  });

  return (
    <Modal
      title={kind === "purge" ? t.purgeConfirmTitle : t.deleteAccountConfirmTitle}
      subtitle={kind === "purge" ? t.purgeText : t.deleteAccountText}
      size="confirm"
      icon={kind === "purge" ? "archive" : "trash"}
      tone="danger"
      onClose={onCancel}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {kind === "delete" && (
          <Field label={interpolate(t.typeEmailToConfirm, { email })}>
            <input className="input" name="confirm" autoComplete="off" required />
          </Field>
        )}
        <Field label={t.password} hint={t.confirmWithPassword}>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <ModalActions
          onCancel={onCancel}
          submitLabel={kind === "purge" ? t.purgeCta : t.deleteAccountCta}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
