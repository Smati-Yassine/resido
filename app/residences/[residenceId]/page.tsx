import Link from "next/link";
import { loadWorkspace } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMoney, formatMonth, percent } from "@/lib/format";
import { cycleRange } from "@/lib/cycle-view";
import { outstandingLots, ownerOptions } from "@/lib/lot-rows";
import { computeCycleTreasury } from "@/lib/domain/cycles/service";
import { getExpenseMonths, getLotRows, progressByBloc, totalsFromLotRows } from "@/lib/domain/overview/service";
import { Bar, Kpi, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { PaymentButton } from "@/components/workspace/PaymentModal";
import { ExpenseButton } from "@/components/workspace/ExpenseModal";

export default async function DashboardPage({ params, searchParams }: PageProps<"/residences/[residenceId]">) {
  const { session, residenceId, cycle, currency, can, base } = await loadWorkspace(params, searchParams);
  const { t, locale } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;
  if (cycle.status === "DRAFT") return <DraftCycle base={base} cycle={cycle} t={t} />;

  const [rows, treasury, months, ownerList] = await Promise.all([
    getLotRows(session, residenceId, cycle.id),
    computeCycleTreasury(residenceId, cycle),
    getExpenseMonths(session, residenceId, cycle.id),
    ownerOptions(session, residenceId),
  ]);
  const totals = totalsFromLotRows(rows);
  const blocs = progressByBloc(rows);
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const lotShare = (n: number) => `${totals.lotCount ? (n / totals.lotCount) * 100 : 0}%`;
  const maxMonth = Math.max(1, ...months.map((m) => m.totalMillimes));
  const cycleQuery = `?cycle=${cycle.id}`;

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={cycleRange(cycle, t)}
        title={t.dashboard}
        actions={
          cycle.status === "OPEN" && (
            <>
              {can("expenses:create") && <ExpenseButton residenceId={residenceId} variant="ghost" />}
              {can("payments:create") && (
                <PaymentButton
                  residenceId={residenceId}
                  lots={outstandingLots(rows)}
                  owners={ownerList}
                  label={t.addPayment}
                />
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          label={t.kpiExpected}
          value={formatMoney(totals.expectedMillimes, currency)}
          foot={interpolate(t.dtLots, { cur: currencySymbol(currency), count: totals.lotCount })}
        />
        <Kpi
          label={t.kpiCollected}
          value={formatMoney(totals.collectedMillimes, currency)}
          valueClassName="text-pos"
          foot={interpolate(t.dtCollected, { cur: currencySymbol(currency) })}
        />
        <Kpi
          label={t.kpiOutstanding}
          value={formatMoney(totals.outstandingMillimes, currency)}
          valueClassName="text-neg"
          foot={interpolate(t.dtLotsConcerned, {
            cur: currencySymbol(currency),
            count: totals.partial + totals.unpaid,
          })}
        />
        <div className="card-night flex flex-col gap-2.5 p-5">
          <span className="text-[13px] font-semibold text-night-soft">{t.kpiRate}</span>
          <span className="font-display text-[40px] leading-none">{rate} %</span>
          <div className="bar bar-on-night">
            <div className="bar-fill bar-fill-ochre" style={{ width: `${rate}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-[18px] xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.lotState}</h2>
            <Link href={`${base}/lots${cycleQuery}`} className="btn btn-link">
              {t.seeLots}
            </Link>
          </div>
          <div className="bar-stack">
            <div className="fill-paid" style={{ width: lotShare(totals.paid) }} />
            <div className="fill-partial" style={{ width: lotShare(totals.partial) }} />
            <div className="fill-unpaid" style={{ width: lotShare(totals.unpaid) }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["fill-paid", t.paidPlural, totals.paid],
                ["fill-partial", t.partialPlural, totals.partial],
                ["fill-unpaid", t.unpaidPlural, totals.unpaid],
              ] as const
            ).map(([fill, label, count]) => (
              <div key={fill} className="flex items-center gap-2.5">
                <span className={`swatch ${fill}`} />
                <span className="text-sm">{label}</span>
                <b className="ml-auto text-lg">{count}</b>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-bold text-muted">{t.byBloc}</span>
            {blocs.map((b) => {
              const blocRate = percent(b.collectedMillimes, b.expectedMillimes);
              return (
                <div key={b.blocId ?? ""} className="grid grid-cols-[120px_1fr_170px] items-center gap-4 text-sm">
                  <span className="font-semibold">{b.name}</span>
                  <Bar value={blocRate} tone="pos" />
                  <span className="num text-right text-ink-2">
                    {interpolate(t.blocProgress, { rate: blocRate, paid: b.paidCount, count: b.lotCount })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card card-pad flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.treasury}</h2>
            <Link href={`${base}/treasury${cycleQuery}`} className="btn btn-link">
              {t.detail}
            </Link>
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t.startBalance}</dt>
              <dd className="num font-semibold">{formatMoney(treasury.openingBalanceMillimes, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t.plusIncome}</dt>
              <dd className="num text-pos font-semibold">{formatMoney(treasury.incomeMillimes, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t.minusExpenses}</dt>
              <dd className="num text-neg font-semibold">{formatMoney(treasury.expenseMillimes, currency)}</dd>
            </div>
          </dl>
          <div className="well mt-auto flex flex-col gap-1 p-4">
            <span className="label-caps">{cycle.status === "CLOSED" ? t.closingBalance : t.currentBalance}</span>
            <span className="num font-display text-[32px]">
              {formatMoney(treasury.closingBalanceMillimes, currency)}{" "}
              <span className="font-sans text-sm text-muted">{currencySymbol(currency)}</span>
            </span>
          </div>
        </section>
      </div>

      <section className="card card-pad flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="h-card">{t.expensesByMonth}</h2>
          <Link href={`${base}/expenses${cycleQuery}`} className="btn btn-link">
            {t.allExpenses} →
          </Link>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted">{t.noExpensesYet}</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-10 gap-y-3 lg:grid-cols-2">
            {months.map((m) => (
              <div key={m.month} className="grid grid-cols-[140px_1fr_110px] items-center gap-3.5 text-sm">
                <span>{formatMonth(m.month, locale)}</span>
                <Bar value={Math.max(2, (m.totalMillimes / maxMonth) * 100)} />
                <span className="num text-right font-semibold">{formatMoney(m.totalMillimes, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
