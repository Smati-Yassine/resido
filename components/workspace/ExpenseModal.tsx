"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { recordExpenseAction } from "@/lib/actions/workspace";
import { toInputAmount, todayIso } from "@/lib/format";
import { useCurrency } from "@/components/ui/CurrencyProvider";
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

/** An existing expense, as the edit form starts from it. */
export interface EditableExpense {
  id: string;
  label: string;
  amountMillimes: number;
  reference: string | null;
  /** "YYYY-MM-DD" */
  date: string;
}

/** Records a new expense, or edits `expense` when given. */
export function ExpenseModal({
  residenceId,
  expense,
  onClose,
}: {
  residenceId: string;
  expense?: EditableExpense;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  // One key per opened form: a double submit records the expense once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [onSubmit, pending] = useActionToast(recordExpenseAction, onClose);
  return (
    <Modal title={expense ? t.editExpense : t.newExpense} width={500} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {expense && <input type="hidden" name="expenseId" value={expense.id} />}
        <Field label={t.expLabel}>
          <input
            className="input"
            name="label"
            defaultValue={expense?.label}
            placeholder={t.expLabelPlaceholder}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.amount}>
            <MoneyInput
              name="amount"
              defaultValue={expense ? toInputAmount(expense.amountMillimes, code) : undefined}
              required
            />
          </Field>
          <Field label={t.date}>
            <input className="input" type="date" name="date" defaultValue={expense?.date ?? todayIso()} required />
          </Field>
        </div>
        <Field label={t.reference}>
          <input
            className="input"
            name="reference"
            defaultValue={expense?.reference ?? ""}
            placeholder={t.referencePlaceholder}
          />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={expense ? t.saveChanges : t.saveExpense} pending={pending} />
      </form>
    </Modal>
  );
}
