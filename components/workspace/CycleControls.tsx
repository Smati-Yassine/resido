"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import {
  closeCycleAction,
  createCycleAction,
  deleteCycleAction,
  openCycleAction,
  reopenCycleAction,
} from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount, todayIso } from "@/lib/format";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { Icon } from "@/components/ui/Icon";
import { ModalButton } from "./ModalButton";
import { useResidenceBase } from "@/components/shell/ResidenceLink";
import { useViewedCycle } from "@/components/shell/ViewedCycle";
import { ModalActions } from "./ModalActions";

export function NewCycleButton({ residenceId, label }: { residenceId: string; label?: string }) {
  const { t } = useI18n();
  return (
    <ModalButton label={label ?? t.newCycle}>
      {(close) => <NewCycleModal residenceId={residenceId} onClose={close} />}
    </ModalButton>
  );
}

function NewCycleModal({ residenceId, onClose }: { residenceId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [endMode, setEndMode] = useState<"fixed" | "open">("open");
  // The new cycle appears in the list; the page stays on the cycle being viewed.
  const [onSubmit, pending] = useActionToast(createCycleAction, onClose);

  return (
    <Modal title={t.newCycle} subtitle={t.newCycleHelp} icon="calendar" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="endMode" value={endMode} />
        <Field label={t.cycleName}>
          <input className="input" name="name" placeholder={t.cycleNamePlaceholder} required />
        </Field>
        <Field label={t.start}>
          <input className="input" type="date" name="startDate" defaultValue={todayIso()} required />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">{t.end}</span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="choice"
              aria-pressed={endMode === "fixed"}
              onClick={() => setEndMode("fixed")}
            >
              <span className="choice-title">{t.fixedEnd}</span>
              <span className="choice-text">{t.fixedEndText}</span>
            </button>
            <button
              type="button"
              className="choice"
              aria-pressed={endMode === "open"}
              onClick={() => setEndMode("open")}
            >
              <span className="choice-title">{t.openEnd}</span>
              <span className="choice-text">{t.openEndText}</span>
            </button>
          </div>
        </div>
        {/* Always shown, so the modal keeps its height; usable once "fixed end" is chosen. */}
        <Field label={t.endDate}>
          <input
            className="input"
            type="date"
            name="endDate"
            required={endMode === "fixed"}
            disabled={endMode === "open"}
          />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.createCycle} pending={pending} />
      </form>
    </Modal>
  );
}

export function OpenCycleButton({ residenceId, cycleId }: { residenceId: string; cycleId: string }) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(openCycleAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="residenceId" value={residenceId} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {t.openCycle}
      </button>
    </form>
  );
}

/** Makes a closed cycle the current one again (refused while another is open). */
export function ReopenCycleButton({ residenceId, cycleId }: { residenceId: string; cycleId: string }) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(reopenCycleAction);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="residenceId" value={residenceId} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <button type="submit" className="btn btn-ghost" disabled={pending} title={t.reopenCycleHelp}>
        {t.reopenCycle}
      </button>
    </form>
  );
}

export function CloseCycleButton({
  residenceId,
  cycleId,
  cycleName,
  closingBalanceMillimes,
}: {
  residenceId: string;
  cycleId: string;
  cycleName: string;
  closingBalanceMillimes: number;
}) {
  const { t } = useI18n();
  return (
    <ModalButton label={t.closeNow} className="btn btn-warn">
      {(close) => (
        <CloseCycleModal
          residenceId={residenceId}
          cycleId={cycleId}
          cycleName={cycleName}
          closingBalanceMillimes={closingBalanceMillimes}
          onClose={close}
        />
      )}
    </ModalButton>
  );
}

function CloseCycleModal({
  residenceId,
  cycleId,
  cycleName,
  closingBalanceMillimes,
  onClose,
}: {
  residenceId: string;
  cycleId: string;
  cycleName: string;
  closingBalanceMillimes: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const [onSubmit, pending] = useActionToast(closeCycleAction, onClose);
  return (
    <Modal
      title={interpolate(t.closeTitle, { name: cycleName })}
      size="confirm"
      icon="lock"
      tone="warn"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycleId} />
        <p className="text-[15px] leading-relaxed text-ink-2">{t.closeText}</p>
        <div className="well flex items-center justify-between px-4 py-3.5">
          <span className="text-sm text-ink-2">{t.closingBalance}</span>
          <span className="num text-xl font-bold">{formatAmount(closingBalanceMillimes, code)}</span>
        </div>
        <ModalActions
          onCancel={onClose}
          submitLabel={t.closeNow}
          pending={pending}
          submitClassName="btn btn-warn-solid"
        />
      </form>
    </Modal>
  );
}

export function DeleteCycleButton({
  residenceId,
  cycleId,
  cycleName,
}: {
  residenceId: string;
  cycleId: string;
  cycleName: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn icon-btn-danger"
        aria-label={t.deleteCycle}
        title={t.deleteCycle}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" />
      </button>
      {open && (
        <DeleteCycleModal
          residenceId={residenceId}
          cycleId={cycleId}
          cycleName={cycleName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DeleteCycleModal({
  residenceId,
  cycleId,
  cycleName,
  onClose,
}: {
  residenceId: string;
  cycleId: string;
  cycleName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const base = useResidenceBase();
  const params = useSearchParams();
  const viewed = useViewedCycle();
  const [onSubmit, pending] = useActionToast(deleteCycleAction, () => {
    onClose();
    // Only when the URL names the deleted cycle: drop it, in place, so the default cycle shows.
    if (params.get("cycle") && viewed?.id === cycleId) router.replace(`${base}/settings/cycles`, { scroll: false });
  });
  return (
    <Modal
      title={interpolate(t.deleteCycleTitle, { name: cycleName })}
      size="confirm"
      icon="trash"
      tone="danger"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycleId} />
        <p className="text-[15px] leading-relaxed text-ink-2">{t.deleteCycleText}</p>
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

/**
 * Everything that can be done with one cycle, behind a "⋯" button: view,
 * open, close, reopen, delete. The menu is fixed-positioned (tables clip
 * overflow); the confirmations and the forms live outside it, so closing the
 * menu never cancels what was picked.
 */
export function CycleMenu({
  residenceId,
  cycle,
  viewHref,
  canManage,
  canOpen,
}: {
  residenceId: string;
  cycle: { id: string; name: string; status: "DRAFT" | "OPEN" | "CLOSED"; closingBalanceMillimes: number | null };
  viewHref: string;
  canManage: boolean;
  canOpen: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const [dialog, setDialog] = useState<"close" | "delete" | null>(null);
  const [onOpen] = useActionToast(openCycleAction);
  const [onReopen] = useActionToast(reopenCycleAction);
  const formId = (what: string) => `cycle-${what}-${cycle.id}`;

  useEffect(() => {
    if (!at) return;
    const hide = () => setAt(null);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, [at]);

  const item = (label: string, onClick: () => void, danger = false, form?: string) => (
    <button
      type={form ? "submit" : "button"}
      form={form}
      className={`menu-item h-10 py-0 text-sm ${danger ? "text-danger" : ""}`}
      role="menuitem"
      onClick={() => {
        onClick();
        setAt(null);
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        className="icon-btn h-9 w-9"
        aria-label={t.cycleActions}
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt(at ? null : { top: box.bottom + 6, right: window.innerWidth - box.right });
        }}
      >
        <Icon name="more" size={18} />
      </button>
      {at && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAt(null)} aria-hidden="true" />
          <div className="popover fixed z-50 w-56" style={at} role="menu">
            {cycle.status !== "DRAFT" && item(t.view, () => router.push(viewHref))}
            {canManage && cycle.status === "DRAFT" && canOpen && item(t.openCycle, () => {}, false, formId("open"))}
            {canManage &&
              cycle.status === "OPEN" &&
              cycle.closingBalanceMillimes !== null &&
              item(t.closeNow, () => setDialog("close"))}
            {canManage && cycle.status === "CLOSED" && item(t.reopenCycle, () => {}, false, formId("reopen"))}
            {canManage && (
              <>
                <div className="divider my-1" />
                {item(t.deleteCycle, () => setDialog("delete"), true)}
              </>
            )}
          </div>
        </>
      )}
      <form id={formId("open")} onSubmit={onOpen} hidden>
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycle.id} />
      </form>
      <form id={formId("reopen")} onSubmit={onReopen} hidden>
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycle.id} />
      </form>
      {dialog === "close" && cycle.closingBalanceMillimes !== null && (
        <CloseCycleModal
          residenceId={residenceId}
          cycleId={cycle.id}
          cycleName={cycle.name}
          closingBalanceMillimes={cycle.closingBalanceMillimes}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "delete" && (
        <DeleteCycleModal
          residenceId={residenceId}
          cycleId={cycle.id}
          cycleName={cycle.name}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
