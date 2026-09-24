"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { deleteOwnerAction, saveOwnerAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

export interface OwnerDraft {
  id: string;
  name: string;
  phone: string | null;
  lotIds: string[];
}

/** Every lot of the residence, with who holds it now — the choices in the owner form. */
export interface LotChoice {
  id: string;
  code: string;
  bloc: string;
  ownerId: string | null;
  ownerName: string | null;
}

export function NewOwnerButton({ residenceId, lots }: { residenceId: string; lots: LotChoice[] }) {
  const { t } = useI18n();
  return (
    <ModalButton label={t.newOwner} icon="plus">
      {(close) => <OwnerModal residenceId={residenceId} lots={lots} onClose={close} />}
    </ModalButton>
  );
}

export function OwnerRowActions({
  residenceId,
  owner,
  lots,
}: {
  residenceId: string;
  owner: OwnerDraft;
  lots: LotChoice[];
}) {
  const { t } = useI18n();
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="icon-btn" aria-label={t.edit} title={t.edit} onClick={() => setModal("edit")}>
        <Icon name="edit" />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-danger"
        aria-label={t.delete}
        title={t.delete}
        onClick={() => setModal("delete")}
      >
        <Icon name="trash" />
      </button>
      {modal === "edit" && (
        <OwnerModal residenceId={residenceId} lots={lots} owner={owner} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && (
        <DeleteOwnerModal residenceId={residenceId} owner={owner} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function OwnerModal({
  residenceId,
  lots,
  owner,
  onClose,
}: {
  residenceId: string;
  lots: LotChoice[];
  owner?: OwnerDraft;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(owner?.lotIds ?? []));
  const [onSubmit, pending] = useActionToast(saveOwnerAction, onClose);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal title={owner ? t.editOwner : t.newOwner} subtitle={t.ownerHelp} width={620} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        {owner && <input type="hidden" name="ownerId" value={owner.id} />}
        {[...picked].map((id) => (
          <input key={id} type="hidden" name="lotIds" value={id} />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.ownerName}>
            <input
              className="input"
              name="name"
              defaultValue={owner?.name}
              placeholder={t.ownerNamePlaceholder}
              required
            />
          </Field>
          <Field label={t.phone}>
            <input
              className="input"
              name="phone"
              type="tel"
              defaultValue={owner?.phone ?? ""}
              placeholder={t.phonePlaceholder}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">
            {t.ownerLots} · {picked.size}
          </span>
          {lots.length === 0 ? (
            <span className="text-sm text-muted">{t.noLotsYet}</span>
          ) : (
            <div className="scroll grid max-h-[300px] grid-cols-2 gap-2 pr-1 sm:grid-cols-3">
              {lots.map((lot) => {
                const on = picked.has(lot.id);
                const elsewhere = lot.ownerId && lot.ownerId !== owner?.id ? lot.ownerName : null;
                return (
                  <button
                    key={lot.id}
                    type="button"
                    className="choice flex-row items-center gap-2.5 px-3 py-2.5"
                    aria-pressed={on}
                    onClick={() => toggle(lot.id)}
                  >
                    <span className="check pointer-events-none h-5 w-5 rounded-md" data-on={on}>
                      {on && <Icon name="check" size={12} strokeWidth={3} />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="choice-title">
                        {lot.code} <span className="font-medium text-muted">· {lot.bloc}</span>
                      </span>
                      {elsewhere && (
                        <span className="choice-text truncate">{interpolate(t.ownedBy, { name: elsewhere })}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <ModalActions onCancel={onClose} submitLabel={owner ? t.save : t.create} pending={pending} />
      </form>
    </Modal>
  );
}

function DeleteOwnerModal({
  residenceId,
  owner,
  onClose,
}: {
  residenceId: string;
  owner: OwnerDraft;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(deleteOwnerAction, onClose);
  return (
    <Modal title={interpolate(t.deleteOwnerTitle, { name: owner.name })} width={460} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="ownerId" value={owner.id} />
        <p className="text-[15px] leading-relaxed text-ink-2">{t.deleteOwnerText}</p>
        <ModalActions
          onCancel={onClose}
          submitLabel={t.deleteForever}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
