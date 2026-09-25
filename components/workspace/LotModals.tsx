"use client";

import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { createBlocAction, createLotAction } from "@/lib/actions/workspace";
import { ModalButton } from "./ModalButton";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { toInputAmount } from "@/lib/format";
import { ModalActions } from "./ModalActions";
import { Notice } from "@/components/ui/Display";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useViewedCycle, ViewedCycleField } from "@/components/shell/ViewedCycle";

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

/** An existing lot, as the edit form starts from it. */
export interface EditableLot {
  id: string;
  code: string;
  buildingId: string | null;
  chargeMillimes: number;
  ownerId: string | null;
}

/** Adds a lot, or edits `lot` when given (code, bloc, annual charge, owner). */
export function LotModal({
  residenceId,
  blocs,
  owners,
  lot,
  onClose,
}: {
  residenceId: string;
  blocs: Option[];
  owners: Option[];
  lot?: EditableLot;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { code: currency, symbol } = useCurrency();
  const cycle = useViewedCycle();
  const [onSubmit, pending] = useActionToast(createLotAction, onClose);
  return (
    <Modal title={lot ? t.editLot : t.addLot} subtitle={lot ? t.editLotHelp : t.lotHelp} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        {lot && <input type="hidden" name="lotId" value={lot.id} />}
        <ViewedCycleField />
        <Field label={t.lotCode}>
          <input className="input" name="code" defaultValue={lot?.code} placeholder={t.lotCodePlaceholder} required />
        </Field>
        <Field label={t.bloc}>
          <select className="input" name="buildingId" defaultValue={lot?.buildingId ?? blocs[0]?.id}>
            {blocs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={interpolate(t.annualCharge, { cur: symbol })}>
          <MoneyInput
            name="charge"
            defaultValue={lot ? toInputAmount(lot.chargeMillimes, currency) : undefined}
            required
          />
        </Field>
        <Field label={t.owner}>
          <select className="input" name="ownerId" defaultValue={lot?.ownerId ?? ""}>
            <option value="">{t.noOwner}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        {lot && cycle && cycle.status !== "DRAFT" && (
          <Notice icon="calendar">{interpolate(t.lotCycleNote, { name: cycle.name })}</Notice>
        )}
        <ModalActions onCancel={onClose} submitLabel={lot ? t.saveChanges : t.addLot} pending={pending} />
      </form>
    </Modal>
  );
}
