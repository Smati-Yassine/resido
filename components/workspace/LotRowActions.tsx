"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { deleteLotAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { LotModal, type EditableLot } from "./LotModals";
import { ModalActions } from "./ModalActions";

type Option = { id: string; name: string };

/** Edit / delete buttons on a lot row. */
export function LotRowActions({
  residenceId,
  lot,
  blocs,
  owners,
}: {
  residenceId: string;
  lot: EditableLot;
  blocs: Option[];
  owners: Option[];
}) {
  const { t } = useI18n();
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const close = () => setModal(null);
  return (
    <span className="flex justify-end gap-1.5">
      <button
        type="button"
        className="icon-btn h-9 w-9"
        aria-label={`${t.editLot} ${lot.code}`}
        title={t.editLot}
        onClick={() => setModal("edit")}
      >
        <Icon name="edit" size={16} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-danger h-9 w-9"
        aria-label={`${t.deleteLot} ${lot.code}`}
        title={t.deleteLot}
        onClick={() => setModal("delete")}
      >
        <Icon name="trash" size={16} />
      </button>
      {modal === "edit" && (
        <LotModal residenceId={residenceId} blocs={blocs} owners={owners} lot={lot} onClose={close} />
      )}
      {modal === "delete" && <DeleteLotModal residenceId={residenceId} lot={lot} onClose={close} />}
    </span>
  );
}

function DeleteLotModal({ residenceId, lot, onClose }: { residenceId: string; lot: EditableLot; onClose: () => void }) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(deleteLotAction, onClose);
  return (
    <Modal
      title={interpolate(t.deleteLotTitle, { code: lot.code })}
      size="confirm"
      icon="trash"
      tone="danger"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="lotId" value={lot.id} />
        <p className="text-[15px] leading-relaxed text-ink-2">{t.deleteLotText}</p>
        <ModalActions
          onCancel={onClose}
          submitLabel={t.deleteLot}
          pending={pending}
          submitClassName="btn btn-danger-solid"
        />
      </form>
    </Modal>
  );
}
