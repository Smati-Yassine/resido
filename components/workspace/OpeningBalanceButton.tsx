"use client";

import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { setOpeningBalanceAction } from "@/lib/actions/workspace";
import { toInputAmount } from "@/lib/format";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

/** The pencil beside the starting balance — the one typed-in treasury figure. */
export function OpeningBalanceButton({
  residenceId,
  cycleId,
  openingMillimes,
}: {
  residenceId: string;
  cycleId: string;
  openingMillimes: number;
}) {
  const { t } = useI18n();
  return (
    <ModalButton
      label={<span className="sr-only">{t.editStartBalance}</span>}
      icon="edit"
      className="icon-btn h-7 w-7"
    >
      {(close) => (
        <OpeningBalanceModal
          residenceId={residenceId}
          cycleId={cycleId}
          openingMillimes={openingMillimes}
          onClose={close}
        />
      )}
    </ModalButton>
  );
}

function OpeningBalanceModal({
  residenceId,
  cycleId,
  openingMillimes,
  onClose,
}: {
  residenceId: string;
  cycleId: string;
  openingMillimes: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const [onSubmit, pending] = useActionToast(setOpeningBalanceAction, onClose);
  return (
    <Modal title={t.editStartBalance} subtitle={t.treasuryNote} width={460} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycleId} />
        <Field label={t.startBalance} hint={t.startEditNote}>
          <MoneyInput scale="lg" name="amount" defaultValue={toInputAmount(openingMillimes, code)} required />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.save} pending={pending} />
      </form>
    </Modal>
  );
}
