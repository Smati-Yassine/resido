"use client";

import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { createBlocAction, createLotAction } from "@/lib/actions/workspace";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

export function NewBlocButton({ residenceId }: { residenceId: string }) {
  const { t } = useI18n();
  return (
    <ModalButton label={t.newBloc} icon="plus" className="btn btn-ghost">
      {(close) => <BlocModal residenceId={residenceId} onClose={close} />}
    </ModalButton>
  );
}

function BlocModal({ residenceId, onClose }: { residenceId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(createBlocAction, onClose);
  return (
    <Modal title={t.newBloc} subtitle={t.blocHelp} width={460} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <Field label={t.blocName}>
          <input className="input" name="name" placeholder={t.blocNamePlaceholder} required />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.createBloc} pending={pending} />
      </form>
    </Modal>
  );
}

type Option = { id: string; name: string };

export function AddLotButton({
  residenceId,
  blocs,
  owners,
}: {
  residenceId: string;
  blocs: Option[];
  owners: Option[];
}) {
  const { t } = useI18n();
  return (
    <ModalButton label={t.addLot}>
      {(close) => <LotModal residenceId={residenceId} blocs={blocs} owners={owners} onClose={close} />}
    </ModalButton>
  );
}

function LotModal({
  residenceId,
  blocs,
  owners,
  onClose,
}: {
  residenceId: string;
  blocs: Option[];
  owners: Option[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(createLotAction, onClose);
  return (
    <Modal title={t.addLot} subtitle={t.lotHelp} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <Field label={t.lotCode}>
          <input className="input" name="code" placeholder={t.lotCodePlaceholder} required />
        </Field>
        <Field label={t.bloc}>
          <select className="input" name="buildingId" defaultValue={blocs[0]?.id}>
            {blocs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.annualCharge}>
          <MoneyInput name="charge" required />
        </Field>
        <Field label={t.owner}>
          <select className="input" name="ownerId" defaultValue="">
            <option value="">{t.noOwner}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <ModalActions onCancel={onClose} submitLabel={t.addLot} pending={pending} />
      </form>
    </Modal>
  );
}
