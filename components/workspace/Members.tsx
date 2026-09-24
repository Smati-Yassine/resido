"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Display";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { addMemberAction, cancelInvitationAction, changeRoleAction, removeMemberAction } from "@/lib/actions/members";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { initials } from "@/lib/format";
import { ModalActions } from "./ModalActions";

const ROLES = ["SYNDIC_ADMIN", "ACCOUNTANT", "VIEWER"] as const;

interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  since: string;
}

const roleLabel = (t: Dictionary, role: string) => (t as Record<string, string>)[`role${role}`] ?? role;

export function MembersPanel({
  residenceId,
  residenceName,
  currentUserId,
  canManage,
  members,
  invitations,
}: {
  residenceId: string;
  residenceName: string;
  currentUserId: string;
  canManage: boolean;
  members: MemberRow[];
  invitations: { id: string; email: string; role: string }[];
}) {
  const { t } = useI18n();
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{t.membersHelp}</p>
      {canManage && <AddMemberForm residenceId={residenceId} />}

      <div className="card data-table">
        {members.map((m) => {
          const self = m.userId === currentUserId;
          return (
            <div key={m.userId} className="data-row grid-cols-[40px_1fr_200px_130px]">
              <span className="avatar avatar-sm">{initials(m.name)}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold">
                  {m.name} {self && <span className="font-medium text-muted">({t.you})</span>}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {m.email} · {interpolate(t.since, { date: m.since })}
                </span>
              </span>
              {canManage ? (
                <RoleSelect residenceId={residenceId} member={m} />
              ) : (
                <span>
                  <Badge tone={m.role === "SYNDIC_ADMIN" ? "open" : "closed"}>{roleLabel(t, m.role)}</Badge>
                </span>
              )}
              <span className="flex justify-end">
                {(canManage || self) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(m)}>
                    {self ? t.leave : t.remove}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {invitations.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="label-caps">{t.pendingInvitations}</span>
          <div className="card data-table">
            {invitations.map((i) => (
              <div key={i.id} className="data-row grid-cols-[1fr_200px_180px]">
                <span className="truncate font-semibold">{i.email}</span>
                <span>
                  <Badge tone="draft">{interpolate(t.invitedAs, { role: roleLabel(t, i.role) })}</Badge>
                </span>
                <span className="flex justify-end">
                  {canManage && <CancelInvitationButton residenceId={residenceId} invitationId={i.id} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {removing && (
        <RemoveMemberModal
          residenceId={residenceId}
          residenceName={residenceName}
          member={removing}
          self={removing.userId === currentUserId}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function AddMemberForm({ residenceId }: { residenceId: string }) {
  const { t } = useI18n();
  const [role, setRole] = useState<(typeof ROLES)[number]>("ACCOUNTANT");
  const [formKey, setFormKey] = useState(0);
  const [onSubmit, pending] = useActionToast(addMemberAction, () => setFormKey((k) => k + 1));
  return (
    <form key={formKey} onSubmit={onSubmit} className="card card-pad flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="h-card">{t.addMember}</h2>
        <p className="text-[13px] text-muted">{t.addMemberHelp}</p>
      </div>
      <input type="hidden" name="residenceId" value={residenceId} />
      <input type="hidden" name="role" value={role} />
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto]">
        <Field label={t.memberEmail}>
          <input className="input" name="email" type="email" placeholder={t.emailPlaceholder} required />
        </Field>
        <button type="submit" className="btn btn-primary h-[46px]" disabled={pending}>
          {t.addMember}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {ROLES.map((r) => (
          <button key={r} type="button" className="choice" aria-pressed={role === r} onClick={() => setRole(r)}>
            <span className="choice-title">{roleLabel(t, r)}</span>
            <span className="choice-text">{(t as Record<string, string>)[`roleHelp${r}`]}</span>
          </button>
        ))}
      </div>
    </form>
  );
}

function RoleSelect({ residenceId, member }: { residenceId: string; member: MemberRow }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(member.role);
  return (
    <select
      className="input h-9 py-0 text-sm"
      aria-label={`${t.role} — ${member.name}`}
      value={shown}
      disabled={pending}
      onChange={(event) => {
        const role = event.target.value;
        startTransition(async () => {
          setShown(role);
          const result = await changeRoleAction(residenceId, { userId: member.userId, name: member.name }, role);
          toast({ tone: result.ok ? "success" : "danger", text: result.message });
        });
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {roleLabel(t, r)}
        </option>
      ))}
    </select>
  );
}

function CancelInvitationButton({ residenceId, invitationId }: { residenceId: string; invitationId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelInvitationAction(residenceId, invitationId);
          toast({ tone: result.ok ? "success" : "danger", text: result.message });
        })
      }
    >
      {t.cancelInvitation}
    </button>
  );
}

function RemoveMemberModal({
  residenceId,
  residenceName,
  member,
  self,
  onClose,
}: {
  residenceId: string;
  residenceName: string;
  member: MemberRow;
  self: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [onSubmit, pending] = useActionToast(removeMemberAction, () => {
    onClose();
    if (self) router.replace("/residences");
  });
  return (
    <Modal
      title={interpolate(self ? t.leaveTitle : t.removeMemberTitle, { name: self ? residenceName : member.name })}
      width={460}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="userId" value={member.userId} />
        <input type="hidden" name="name" value={member.name} />
        <p className="text-[15px] leading-relaxed text-ink-2">{self ? t.leaveText : t.removeMemberText}</p>
        <ModalActions
          onCancel={onClose}
          submitLabel={self ? t.leave : t.remove}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
