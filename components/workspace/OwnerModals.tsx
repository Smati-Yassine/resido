"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { deleteOwnerAction, saveOwnerAction } from "@/lib/actions/workspace";
import { fold } from "@/lib/text";
import { interpolate } from "@/lib/i18n/dictionaries";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";
import { Notice } from "@/components/ui/Display";
import { useViewedCycle, ViewedCycleField } from "@/components/shell/ViewedCycle";

export interface OwnerDraft {
  id: string;
  name: string;
  phone: string | null;
  lotIds: string[];
}

/** Every lot of the residence, with who holds it in the cycle on screen — the choices in the owner form. */
export interface LotChoice {
  id: string;
  code: string;
  bloc: string;
  owners: { id: string; name: string }[];
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

type Group = { key: "mine" | "free" | "taken"; title: string; lots: LotChoice[] };

/**
 * Create or edit an owner and choose their lots. The lots come in groups —
 * theirs (when editing), then those without an owner, then those of other
 * owners — with a search over codes, blocs and owners. Picking a lot that
 * someone else owns asks how: hand it over (Remplacer) or share it
 * (Partager — both own it).
 */
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
  const cycle = useViewedCycle();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(owner?.lotIds ?? []));
  // Lots of other owners this owner joins as a co-owner; picked ones not in here are handed over.
  const [shared, setShared] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [onSubmit, pending] = useActionToast(saveOwnerAction, onClose);

  const others = (lot: LotChoice) => lot.owners.filter((o) => o.id !== owner?.id);
  const isMine = (lot: LotChoice) => !!owner && lot.owners.some((o) => o.id === owner.id);
  const q = fold(query.trim());
  const matches = (lot: LotChoice) =>
    !q || fold(lot.code).includes(q) || fold(lot.bloc).includes(q) || lot.owners.some((o) => fold(o.name).includes(q));
  const groups: Group[] = (
    [
      { key: "mine", title: t.groupMine, lots: lots.filter((l) => isMine(l)) },
      { key: "free", title: t.groupFree, lots: lots.filter((l) => l.owners.length === 0) },
      { key: "taken", title: t.groupTaken, lots: lots.filter((l) => !isMine(l) && l.owners.length > 0) },
    ] as Group[]
  )
    .map((g) => ({ ...g, lots: g.lots.filter(matches) }))
    .filter((g) => g.lots.length > 0);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setMode = (id: string, share: boolean) =>
    setShared((current) => {
      const next = new Set(current);
      if (share) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Modal title={owner ? t.editOwner : t.newOwner} subtitle={t.ownerHelp} size="wide" icon="owners" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        {owner && <input type="hidden" name="ownerId" value={owner.id} />}
        <ViewedCycleField />
        {[...picked].map((id) => (
          <input key={id} type="hidden" name="lotIds" value={id} />
        ))}
        {[...shared]
          .filter((id) => picked.has(id))
          .map((id) => (
            <input key={id} type="hidden" name="shareLotIds" value={id} />
          ))}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-ink-2">
              {t.ownerLots} · {interpolate(t.pickedCount, { count: picked.size })}
            </span>
            <label className="search-field max-w-[280px]">
              <span className="search-field-icon">
                <Icon name="search" size={16} />
              </span>
              <input
                className="input h-10 text-sm"
                type="search"
                value={query}
                autoComplete="off"
                placeholder={t.searchLotsOrOwner}
                aria-label={t.searchLotsOrOwner}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {lots.length === 0 ? (
            <span className="text-sm text-muted">{t.noLotsYet}</span>
          ) : (
            <div className="pick-list scroll">
              {groups.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{t.noMatch}</p>}
              {groups.map((group) => (
                <section key={group.key}>
                  <div className="pick-group">
                    {group.title} <span className="num">· {group.lots.length}</span>
                  </div>
                  {group.lots.map((lot) => {
                    const on = picked.has(lot.id);
                    const current = others(lot);
                    const names = current.map((o) => o.name).join(" & ");
                    // Only a lot owned by someone else asks how it is taken.
                    const asks = on && group.key === "taken";
                    return (
                      <div key={lot.id} className="pick-row" data-on={on}>
                        <button
                          type="button"
                          className="pick-row-main"
                          aria-pressed={on}
                          onClick={() => toggle(lot.id)}
                        >
                          <span className="check pointer-events-none h-5 w-5 rounded-md" data-on={on}>
                            {on && <Icon name="check" size={12} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-bold">{lot.code}</span>{" "}
                            <span className="text-[13px] text-muted">· {lot.bloc}</span>
                          </span>
                          {names && !asks && (
                            <span className="truncate text-[13px] text-muted">
                              {group.key === "mine" ? interpolate(t.sharedWith, { name: names }) : names}
                            </span>
                          )}
                        </button>
                        {asks && (
                          <div className="segmented segmented-sm shrink-0" role="group" aria-label={lot.code}>
                            <button
                              type="button"
                              className="segment"
                              aria-pressed={!shared.has(lot.id)}
                              title={interpolate(t.replaceOwnerHint, { name: names })}
                              onClick={() => setMode(lot.id, false)}
                            >
                              {interpolate(t.replaceOwner, { name: names })}
                            </button>
                            <button
                              type="button"
                              className="segment"
                              aria-pressed={shared.has(lot.id)}
                              title={interpolate(t.shareOwnerHint, { name: names })}
                              onClick={() => setMode(lot.id, true)}
                            >
                              {t.shareOwner}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
        {cycle && cycle.status !== "DRAFT" && (
          <Notice icon="calendar">{interpolate(t.ownerCycleNote, { name: cycle.name })}</Notice>
        )}
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
  const cycle = useViewedCycle();
  const billed = cycle && cycle.status !== "DRAFT";
  const [onSubmit, pending] = useActionToast(deleteOwnerAction, onClose);
  return (
    <Modal
      title={interpolate(t.deleteOwnerTitle, { name: owner.name })}
      size="confirm"
      icon="trash"
      tone="danger"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="ownerId" value={owner.id} />
        <ViewedCycleField />
        <p className="text-[15px] leading-relaxed text-ink-2">
          {billed ? interpolate(t.deleteOwnerTextCycle, { name: cycle.name }) : t.deleteOwnerText}
        </p>
        <ModalActions
          onCancel={onClose}
          submitLabel={billed ? t.remove : t.deleteForever}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
