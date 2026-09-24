"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { closeCycleAction, createCycleAction, deleteCycleAction, openCycleAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount, todayIso } from "@/lib/format";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { Icon } from "@/components/ui/Icon";
import { ModalButton } from "./ModalButton";
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
  const router = useRouter();
  const [endMode, setEndMode] = useState<"fixed" | "open">("open");
  const [onSubmit, pending] = useActionToast(createCycleAction, (result) => {
    onClose();
    const created = result.data as { id: string } | undefined;
    if (created) router.push(`/residences/${residenceId}/cycles?cycle=${created.id}`);
  });

  return (
    <Modal title={t.newCycle} subtitle={t.newCycleHelp} width={520} onClose={onClose}>
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
        {endMode === "fixed" && (
          <Field label={t.endDate}>
            <input className="input" type="date" name="endDate" required />
          </Field>
        )}
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
    <Modal title={interpolate(t.closeTitle, { name: cycleName })} onClose={onClose}>
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
  const [onSubmit, pending] = useActionToast(deleteCycleAction, () => {
    onClose();
    // The deleted cycle may be the one in the URL; drop it so the default cycle shows.
    router.replace(`/residences/${residenceId}/cycles`);
  });
  return (
    <Modal title={interpolate(t.deleteCycleTitle, { name: cycleName })} width={460} onClose={onClose}>
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
