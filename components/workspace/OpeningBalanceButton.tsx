"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { setOpeningBalanceAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount, toInputAmount } from "@/lib/format";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

/** The previous cycle, whose closing balance this cycle can start from. */
export interface CarrySource {
  name: string;
  closingMillimes: number;
}

interface OpeningProps {
  residenceId: string;
  cycleId: string;
  openingMillimes: number;
  /** Whether the start currently follows the previous cycle's close. */
  carried: boolean;
  previous: CarrySource | null;
}

/** The pencil beside the starting balance — the one figure of the treasury that is set, not computed. */
export function OpeningBalanceButton(props: OpeningProps) {
  const { t } = useI18n();
  return (
    <ModalButton label={<span className="sr-only">{t.editStartBalance}</span>} icon="edit" className="icon-btn h-7 w-7">
      {(close) => <OpeningBalanceModal {...props} onClose={close} />}
    </ModalButton>
  );
}

function OpeningBalanceModal({
  residenceId,
  cycleId,
  openingMillimes,
  carried,
  previous,
  onClose,
}: OpeningProps & { onClose: () => void }) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const [mode, setMode] = useState<"carry" | "manual">(previous && carried ? "carry" : "manual");
  const [onSubmit, pending] = useActionToast(setOpeningBalanceAction, onClose);

  const choice = (value: "carry" | "manual", title: string, text?: string) => (
    <button
      type="button"
      className="choice flex-row items-start gap-3 px-4 py-3 text-left"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
    >
      <span className="check pointer-events-none mt-0.5 h-5 w-5 rounded-full" data-on={mode === value}>
        {mode === value && <Icon name="check" size={12} strokeWidth={3} />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="choice-title">{title}</span>
        {text && <span className="choice-text">{text}</span>}
      </span>
    </button>
  );

  return (
    <Modal title={t.editStartBalance} subtitle={t.treasuryNote} icon="treasury" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="cycleId" value={cycleId} />
        <input type="hidden" name="mode" value={mode} />
        {previous && (
          <div className="flex flex-col gap-2">
            {choice(
              "carry",
              interpolate(t.carryOption, { name: previous.name }),
              interpolate(t.carryOptionHint, {
                amount: formatAmount(previous.closingMillimes, code),
                name: previous.name,
              }),
            )}
            {choice("manual", t.manualOption)}
          </div>
        )}
        {/* Always shown, so the modal keeps its height: the carried amount, or the one to type. */}
        <Field label={t.startBalance} hint={t.startEditNote}>
          {mode === "carry" && previous ? (
            <MoneyInput
              scale="lg"
              key="carry"
              value={toInputAmount(previous.closingMillimes, code)}
              disabled
              readOnly
            />
          ) : (
            <MoneyInput
              scale="lg"
              key="manual"
              name="amount"
              defaultValue={toInputAmount(openingMillimes, code)}
              required
            />
          )}
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.save} pending={pending} />
      </form>
    </Modal>
  );
}
