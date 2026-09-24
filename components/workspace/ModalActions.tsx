"use client";

import { useI18n } from "@/components/ui/I18nProvider";

export function ModalActions({
  onCancel,
  submitLabel,
  pending,
  submitClassName = "btn btn-primary",
}: {
  onCancel: () => void;
  submitLabel: React.ReactNode;
  pending: boolean;
  submitClassName?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-actions">
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        {t.cancel}
      </button>
      <button type="submit" className={submitClassName} disabled={pending}>
        {submitLabel}
      </button>
    </div>
  );
}
