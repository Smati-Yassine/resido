"use client";

import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { interpolate } from "@/lib/i18n/dictionaries";
import { CURRENCIES, CURRENCY_CODES, DEFAULT_CURRENCY } from "@/lib/currency";
import { createResidenceAction, deleteResidenceAction, updateResidenceAction } from "@/lib/actions/residences";

export interface ResidenceDraft {
  id: string;
  name: string;
  city: string;
}

/** Create (no `residence`) or edit a residence's name and city. */
export function ResidenceFormModal({ residence, onClose }: { residence?: ResidenceDraft; onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [onSubmit, pending] = useActionToast(
    // Both return ActionResult; only creation carries data (the new id).
    (residence ? updateResidenceAction : createResidenceAction) as typeof createResidenceAction,
    (result) => {
      onClose();
      const created = result.data;
      if (created) router.push(`/residences/${created.id}`);
    },
  );

  return (
    <Modal title={residence ? t.editResidence : t.newResidence} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {residence && <input type="hidden" name="residenceId" value={residence.id} />}
        <Field label={t.residenceName}>
          <input
            className="input"
            name="name"
            defaultValue={residence?.name}
            placeholder={t.residenceNamePlaceholder}
            required
          />
        </Field>
        <Field label={t.city}>
          <input className="input" name="city" defaultValue={residence?.city} placeholder={t.cityPlaceholder} />
        </Field>
        {!residence && (
          <Field label={t.currency}>
            <select className="input" name="currency" defaultValue={DEFAULT_CURRENCY}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} · {CURRENCIES[code].symbol} — {CURRENCIES[code].name[locale]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {residence ? t.save : t.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Permanent deletion, confirmed. `afterDelete` decides where to go next. */
export function DeleteResidenceModal({
  residence,
  onClose,
  afterDelete,
}: {
  residence: ResidenceDraft;
  onClose: () => void;
  afterDelete?: () => void;
}) {
  const { t } = useI18n();
  const [onSubmit, pending] = useActionToast(deleteResidenceAction, () => {
    onClose();
    afterDelete?.();
  });

  return (
    <Modal title={interpolate(t.deleteTitle, { name: residence.name })} width={460} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residence.id} />
        <p className="text-[15px] leading-relaxed text-ink-2">{t.deleteText}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-danger-solid" disabled={pending}>
            {t.deleteForever}
          </button>
        </div>
      </form>
    </Modal>
  );
}
