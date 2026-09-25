import { loadWorkspace } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatDate, formatMoney, formatMonth, formatAmount } from "@/lib/format";
import { getExpenseMonths } from "@/lib/domain/overview/service";
import { EmptyState, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { ExpenseButton } from "@/components/workspace/ExpenseModal";

export default async function ExpensesPage({ params, searchParams }: PageProps<"/residences/[residenceId]/expenses">) {
  const { session, residenceId, cycle, currency, can, base } = await loadWorkspace(params, searchParams);
  const { t, locale } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;
  if (cycle.status === "DRAFT") return <DraftCycle base={base} cycle={cycle} t={t} />;

  const months = await getExpenseMonths(session, residenceId, cycle.id);
  const count = months.reduce((n, m) => n + m.items.length, 0);
  const total = months.reduce((n, m) => n + m.totalMillimes, 0);

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={interpolate(t.expensesSubtitle, { count, total: formatAmount(total, currency) })}
        title={t.expenses}
        actions={cycle.status === "OPEN" && can("expenses:create") && <ExpenseButton residenceId={residenceId} />}
      />
      {months.length === 0 ? (
        <EmptyState text={t.noExpensesYet} />
      ) : (
        <div className="flex flex-col gap-4">
          {months.map((m) => (
            <section key={m.month} className="card data-table">
              <div className="flex items-center justify-between border-b border-line bg-surface-2 px-6 py-3.5">
                <h2 className="text-[15px] font-bold">{formatMonth(m.month, locale)}</h2>
                <span className="subtle">
                  {interpolate(t.expensesCount, { count: m.items.length })} ·{" "}
                  <b className="num text-[15px] text-ink">
                    {formatMoney(m.totalMillimes, currency)} {currencySymbol(currency)}
                  </b>
                </span>
              </div>
              {m.items.map((e) => (
                <div key={e.id} className="data-row grid-cols-[110px_1fr_240px_140px]">
                  <span className="text-[13px] text-muted">{formatDate(e.date)}</span>
                  <span className="font-semibold">{e.label}</span>
                  <span className="text-[13px] text-muted">{e.reference ?? ""}</span>
                  <span className="num text-right font-bold">{formatMoney(e.amountMillimes, currency)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
