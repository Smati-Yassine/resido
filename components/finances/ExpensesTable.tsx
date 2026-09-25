import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import type { ExpenseMonth } from "@/lib/domain/overview/service";
import { EmptyState } from "@/components/ui/Display";
import { ExpenseRowActions } from "@/components/workspace/ExpenseRowActions";

/** The Finances "expenses" tab: the cycle's expenses, month by month like the source ledger. */
export function ExpensesTable({
  t,
  locale,
  currency,
  residenceId,
  months,
  canChange,
}: {
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
  residenceId: string;
  months: ExpenseMonth[];
  /** Expenses change only while the cycle is open, and only for roles that may undo them. */
  canChange: boolean;
}) {
  if (months.length === 0) return <EmptyState text={t.noExpensesYet} />;
  const grid = canChange
    ? "grid-cols-[110px_minmax(0,1fr)_minmax(0,240px)_140px_84px]"
    : "grid-cols-[110px_minmax(0,1fr)_minmax(0,240px)_140px]";

  return (
    <div className="flex flex-col gap-4">
      {months.map((m) => (
        <section key={m.month} className="card data-table">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-6 py-3.5">
            <h2 className="text-[15px] font-bold">{formatMonth(m.month, locale)}</h2>
            <span className="subtle">
              {interpolate(t.expensesCount, { count: m.items.length })} ·{" "}
              <b className="num text-[15px] text-ink">
                {formatMoney(m.totalMillimes, currency)} {currencySymbol(currency)}
              </b>
            </span>
          </div>
          {m.items.map((e) => (
            <div key={e.id} className={`data-row ${grid}`}>
              <span className="text-[13px] text-muted">{formatDate(e.date)}</span>
              <span className="font-semibold" title={e.label}>
                {e.label}
              </span>
              <span className="text-[13px] text-muted">{e.reference ?? ""}</span>
              <span className="num text-right font-bold">{formatMoney(e.amountMillimes, currency)}</span>
              {canChange && (
                <ExpenseRowActions
                  residenceId={residenceId}
                  expense={{
                    id: e.id,
                    label: e.label,
                    amountMillimes: e.amountMillimes,
                    reference: e.reference,
                    date: e.date.toISOString().slice(0, 10),
                  }}
                />
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
