"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { deleteExpenseAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount } from "@/lib/format";
import { ExpenseModal, type EditableExpense } from "./ExpenseModal";
import { ModalActions } from "./ModalActions";

/** Edit / delete buttons on an expense row. */
export function ExpenseRowActions({ residenceId, expense }: { residenceId: string; expense: EditableExpense }) {
  const { t } = useI18n();
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const close = () => setModal(null);
  return (
    <span className="flex justify-end gap-1.5">
      <button
        type="button"
        className="icon-btn h-9 w-9"
        aria-label={t.editExpense}
        title={t.editExpense}
        onClick={() => setModal("edit")}
      >
        <Icon name="edit" size={16} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-danger h-9 w-9"
        aria-label={t.deleteExpense}
        title={t.deleteExpense}
        onClick={() => setModal("delete")}
      >
        <Icon name="trash" size={16} />
      </button>
      {modal === "edit" && <ExpenseModal residenceId={residenceId} expense={expense} onClose={close} />}
      {modal === "delete" && <DeleteExpenseModal residenceId={residenceId} expense={expense} onClose={close} />}
    </span>
  );
}

function DeleteExpenseModal({
  residenceId,
  expense,
  onClose,
}: {
  residenceId: string;
  expense: EditableExpense;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const [onSubmit, pending] = useActionToast(deleteExpenseAction, onClose);
  return (
    <Modal title={t.deleteExpenseTitle} width={460} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="expenseId" value={expense.id} />
        <p className="text-[15px] leading-relaxed text-ink-2">
          {interpolate(t.deleteExpenseText, {
            label: expense.label,
            amount: formatAmount(expense.amountMillimes, code),
          })}
        </p>
        <ModalActions
          onCancel={onClose}
          submitLabel={t.deleteExpense}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
