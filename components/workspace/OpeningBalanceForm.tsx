"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/ui/Field";
import { useI18n } from "@/components/ui/I18nProvider";
import { useActionToast } from "@/components/ui/useActionToast";
import { setOpeningBalanceAction } from "@/lib/actions/workspace";
import { toInputAmount } from "@/lib/format";
import { useCurrency } from "@/components/ui/CurrencyProvider";

/** The one typed-in treasury figure: the cycle's starting balance. Save appears once it is edited. */
export function OpeningBalanceForm({
  residenceId,
  cycleId,
  openingMillimes,
}: {
  residenceId: string;
  cycleId: string;
  openingMillimes: number;
}) {
  const { t } = useI18n();
  const { code } = useCurrency();
  const saved = toInputAmount(openingMillimes, code);
  const [value, setValue] = useState(saved);
  const [onSubmit, pending] = useActionToast(setOpeningBalanceAction);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="residenceId" value={residenceId} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <MoneyInput
        scale="lg"
        name="amount"
        id="start-balance"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value !== saved && (
        <button type="submit" className="btn btn-primary btn-sm self-start" disabled={pending}>
          {t.save}
        </button>
      )}
      <span className="text-xs text-muted">{t.startEditNote}</span>
    </form>
  );
}
