"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { deletePaymentAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount } from "@/lib/format";
import { PaymentModal, type EditablePayment, type OutstandingLot } from "./PaymentModal";
import { ModalActions } from "./ModalActions";

/** Edit / delete buttons on a payment row. */
export function PaymentRowActions({
  residenceId,
  lots,
  payment,
  lotCodes,
  amountMillimes,
}: {
  residenceId: string;
  lots: OutstandingLot[];
  payment: EditablePayment;
  lotCodes: string;
  amountMillimes: number;
}) {
  const { t } = useI18n();
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const close = () => setModal(null);
  return (
    <span className="flex justify-end gap-1.5">
      <button
        type="button"
        className="icon-btn h-9 w-9"
        aria-label={t.editPayment}
        title={t.editPayment}
        onClick={() => setModal("edit")}
      >
        <Icon name="edit" size={16} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-danger h-9 w-9"
        aria-label={t.deletePayment}
        title={t.deletePayment}
        onClick={() => setModal("delete")}
      >
        <Icon name="trash" size={16} />
      </button>
      {modal === "edit" && <PaymentModal residenceId={residenceId} lots={lots} payment={payment} onClose={close} />}
      {modal === "delete" && (
        <DeletePaymentModal
          residenceId={residenceId}
          paymentId={payment.id}
          lotCodes={lotCodes}
          amountMillimes={amountMillimes}
          onClose={close}
        />
      )}
    </span>
  );
}

function DeletePaymentModal({
  residenceId,
  paymentId,
  lotCodes,
  amountMillimes,
  onClose,
}: {
  residenceId: string;
  paymentId: string;
  lotCodes: string;
  amountMillimes: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const [onSubmit, pending] = useActionToast(deletePaymentAction, onClose);
  return (
    <Modal title={t.deletePaymentTitle} size="confirm" icon="trash" tone="danger" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="paymentId" value={paymentId} />
        <p className="text-[15px] leading-relaxed text-ink-2">
          {interpolate(t.deletePaymentText, { amount: formatAmount(amountMillimes, code), lots: lotCodes })}
        </p>
        <ModalActions
          onCancel={onClose}
          submitLabel={t.deletePayment}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
