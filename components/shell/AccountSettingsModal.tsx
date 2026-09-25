"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Group, Row, SettingsTabs } from "@/components/settings/SettingsParts";
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

/**
 * Account-wide settings, opened from the user menu — a fixed-size panel with
 * tabs, like the residence settings: General (appearance), Profile, Security,
 * Data. A purge or account deletion is confirmed in a modal on top.
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

  return (
    <Modal title={t.accountSettings} subtitle={user.email} size="panel" icon="user" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <SettingsTabs
          label={t.accountSettings}
          value={tab}
          onChange={setTab}
          items={[
            { key: "general", label: t.tabGeneral },
            { key: "profile", label: t.profile },
            { key: "security", label: t.navSecurity },
            { key: "data", label: t.navData },
          ]}
        />

        {tab === "general" && <AppearanceSettings theme={theme} />}
        {tab === "profile" && <ProfileForm user={user} />}
        {tab === "security" && <SecurityPanel />}
        {tab === "data" && (
          <div className="@container">
            <div className="grid grid-cols-1 items-start gap-5 @xl:grid-cols-2">
              <ExportSection residences={residences} />
              <Group title={t.dangerZone} danger>
                <Row title={t.purgeTitle} text={t.purgeText}>
                  <button type="button" className="btn btn-danger" onClick={() => setConfirm("purge")}>
                    {t.purgeCta}
                  </button>
                </Row>
                <Row title={t.deleteAccountTitle} text={t.deleteAccountText}>
                  <button type="button" className="btn btn-danger-solid" onClick={() => setConfirm("delete")}>
                    {t.deleteAccountCta}
                  </button>
                </Row>
              </Group>
            </div>
          </div>
        )}
      </div>
      {confirm && (
        <DangerConfirm kind={confirm} email={user.email} onCancel={() => setConfirm(null)} onDone={onClose} />
      )}
    </Modal>
  );
}

/** Name and email; a new email also asks for the current password. */
function ProfileForm({ user }: { user: AccountUser }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [onSubmit, pending] = useActionToast(updateProfileAction, () => router.refresh());
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const changed = emailChanged || name.trim() !== user.name;

  return (
    <form onSubmit={onSubmit}>
      <Group title={t.profile} text={t.navProfileDesc}>
        <Row title={t.fullName} text={t.fullNameHelp}>
          <input
            className="input"
            name="name"
            aria-label={t.fullName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </Row>
        <Row title={t.email} text={t.emailHelp}>
          <input
            className="input"
            name="email"
            type="email"
            aria-label={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Row>
        {emailChanged && (
          <Row title={t.currentPassword} text={t.emailChangeNeedsPassword}>
            <input
              className="input"
              name="password"
              type="password"
              aria-label={t.currentPassword}
              autoComplete="current-password"
              required
            />
          </Row>
        )}
        <div className="settings-foot">
          <button type="submit" className="btn btn-primary" disabled={!changed || pending}>
            {t.saveProfile}
          </button>
        </div>
      </Group>
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
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-5 @xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form key={formKey} onSubmit={onSubmit}>
          <Group title={t.changePassword} text={t.passwordChangeHelp}>
            <Row title={t.currentPassword}>
              <input
                className="input"
                name="currentPassword"
                type="password"
                aria-label={t.currentPassword}
                autoComplete="current-password"
                required
              />
            </Row>
            <Row title={t.newPassword} text={t.passwordHint}>
              <input
                className="input"
                name="newPassword"
                type="password"
                aria-label={t.newPassword}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Row>
            <Row title={t.confirmPassword}>
              <input
                className="input"
                name="confirmPassword"
                type="password"
                aria-label={t.confirmPassword}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Row>
            <div className="settings-foot">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {t.changePassword}
              </button>
            </div>
          </Group>
        </form>

        <Group title={t.sessionsTitle} text={t.sessionsText}>
          <div className="settings-foot">
            <button
              type="button"
              className="btn btn-ghost h-auto min-h-10 w-full whitespace-normal py-2 text-center"
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
          </div>
        </Group>
      </div>
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
    <Group title={t.exportTitle} text={t.exportText}>
      {residences.length === 0 ? (
        <p className="border-t border-line-soft px-6 py-5 text-sm text-muted">{t.exportNone}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 border-t border-line-soft px-6 py-4">
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
          <div className="settings-foot">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={picked.size === 0}
              onClick={() => download([...picked])}
            >
              {interpolate(t.exportSelected, { count: picked.size })}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => download(null)}>
              {t.exportAll}
            </button>
          </div>
        </>
      )}
    </Group>
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
