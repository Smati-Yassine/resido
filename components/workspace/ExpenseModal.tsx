"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { recordExpenseAction } from "@/lib/actions/workspace";
import { todayIso } from "@/lib/format";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

export function ExpenseButton({
  residenceId,
  variant = "primary",
}: {
  residenceId: string;
  variant?: "primary" | "ghost";
}) {
  const { t } = useI18n();
  return (
    <ModalButton label={variant === "primary" ? t.newExpense : t.addExpense} className={`btn btn-${variant}`}>
      {(close) => <ExpenseModal residenceId={residenceId} onClose={close} />}
    </ModalButton>
  );
}

function ExpenseModal({ residenceId, onClose }: { residenceId: string; onClose: () => void }) {
  const { t } = useI18n();
  // One key per opened form: a double submit records the expense once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [onSubmit, pending] = useActionToast(recordExpenseAction, onClose);
  return (
    <Modal title={t.newExpense} width={500} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Field label={t.expLabel}>
          <input className="input" name="label" placeholder={t.expLabelPlaceholder} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.amount}>
            <MoneyInput name="amount" required />
          </Field>
          <Field label={t.date}>
            <input className="input" type="date" name="date" defaultValue={todayIso()} required />
          </Field>
        </div>
        <Field label={t.reference}>
          <input className="input" name="reference" placeholder={t.referencePlaceholder} />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.saveExpense} pending={pending} />
      </form>
    </Modal>
  );
}
