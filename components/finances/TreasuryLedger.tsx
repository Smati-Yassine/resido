import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import type { CycleTreasury } from "@/lib/domain/cycles/service";
import { OpeningBalanceButton, type CarrySource } from "@/components/workspace/OpeningBalanceButton";

/**
 * The cycle's treasury as one strip above the Finances tabs:
 * start + payments − expenses = balance. The start is carried over from the
 * previous cycle's close or typed in, through the pencil; the rest follows
 * from the movements.
 */
export function TreasuryLedger({
  t,
  currency,
  treasury,
  closed,
  edit,
}: {
  t: Dictionary;
  currency: CurrencyCode;
  treasury: CycleTreasury;
  closed: boolean;
  edit: {
    residenceId: string;
    cycleId: string;
    previous: CarrySource | null;
  } | null;
}) {
  return (
    <section className="card ledger" aria-label={t.treasury}>
      <div className="ledger-cell">
        {/* The pencil sits beside the label, not inside it: its modal must not inherit the label's styling. */}
        <div className="flex items-center gap-1.5">
          <span className="ledger-label">{t.startBalance}</span>
          {edit && (
            <OpeningBalanceButton
              residenceId={edit.residenceId}
              cycleId={edit.cycleId}
              openingMillimes={treasury.openingBalanceMillimes}
              carried={!!treasury.carriedFrom}
              previous={edit.previous}
            />
          )}
        </div>
        <span className="ledger-value">{formatMoney(treasury.openingBalanceMillimes, currency)}</span>
        {treasury.carriedFrom && (
          <span className="text-xs text-muted">{interpolate(t.carriedFrom, { name: treasury.carriedFrom.name })}</span>
        )}
      </div>
      <div className="ledger-cell">
        <span className="ledger-label">{t.plusIncome}</span>
        <span className="ledger-value text-pos">{formatMoney(treasury.incomeMillimes, currency)}</span>
      </div>
      <div className="ledger-cell">
        <span className="ledger-label">{t.minusExpenses}</span>
        <span className="ledger-value text-neg">{formatMoney(treasury.expenseMillimes, currency)}</span>
      </div>
      <div className="ledger-cell ledger-total">
        <span className="ledger-label">= {closed ? t.closingBalance : t.currentBalance}</span>
        <span className="ledger-value font-display font-normal">
          {formatMoney(treasury.closingBalanceMillimes, currency)}{" "}
          <span className="font-sans text-sm text-night-soft">{currencySymbol(currency)}</span>
        </span>
      </div>
    </section>
  );
}
