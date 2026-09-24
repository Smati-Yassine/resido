"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { setResidenceCurrencyAction, updateResidenceAction } from "@/lib/actions/residences";
import { DeleteResidenceModal } from "@/components/residences/ResidenceModals";
import { useArchive } from "@/components/residences/useArchive";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";

export function GeneralSettings({
  residence,
  canManage,
}: {
  residence: { id: string; name: string; city: string; currency: CurrencyCode };
  canManage: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [onSubmit, pending] = useActionToast(updateResidenceAction);
  const { setArchived, pending: archiving } = useArchive();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="card card-pad flex flex-col gap-4">
        <h2 className="h-card">{t.residenceSection}</h2>
        <input type="hidden" name="residenceId" value={residence.id} />
        <Field label={t.name}>
          <input className="input" name="name" defaultValue={residence.name} readOnly={!canManage} required />
        </Field>
        <Field label={t.city}>
          <input className="input" name="city" defaultValue={residence.city} readOnly={!canManage} />
        </Field>
        {canManage && (
          <button type="submit" className="btn btn-primary self-start" disabled={pending}>
            {t.save}
          </button>
        )}
      </form>
      <CurrencyCard residenceId={residence.id} currency={residence.currency} canManage={canManage} />
      {canManage && (
        <div className="card card-pad card-danger flex flex-col gap-3">
          <h2 className="h-card text-danger">{t.dangerZone}</h2>
          <p className="text-sm text-muted">{t.dangerText}</p>
          <div className="flex gap-2.5">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={archiving}
              onClick={() => setArchived(residence.id, true, () => router.push("/residences"))}
            >
              {t.archive}
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
              {t.delete}
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <DeleteResidenceModal
          residence={residence}
          onClose={() => setConfirmDelete(false)}
          afterDelete={() => {
            router.replace("/residences");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** The residence's currency: changes symbol and decimals everywhere, never the stored amounts. */
function CurrencyCard({
  residenceId,
  currency,
  canManage,
}: {
  residenceId: string;
  currency: CurrencyCode;
  canManage: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <div className="card card-pad flex flex-col gap-3">
      <h2 className="h-card">{t.currency}</h2>
      <p className="text-[13px] text-muted">{t.currencyHelp}</p>
      <select
        className="input"
        aria-label={t.currency}
        value={currency}
        disabled={!canManage || pending}
        onChange={(event) =>
          startTransition(async () => {
            const result = await setResidenceCurrencyAction(residenceId, event.target.value);
            toast({ tone: result.ok ? "success" : "danger", text: result.message });
          })
        }
      >
        {CURRENCY_CODES.map((code) => (
          <option key={code} value={code}>
            {code} · {CURRENCIES[code].symbol} — {CURRENCIES[code].name[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
