import Link from "next/link";
import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatAmount, formatDate, formatMoney, formatMonthShort, percent } from "@/lib/format";
import type { MethodShare, MonthFlow } from "@/lib/domain/overview/finance";
import type { CycleTotals } from "@/lib/domain/overview/service";
import { Icon } from "@/components/ui/Icon";

/** One line of the "latest movements" list: a payment (in) or an expense (out). */
export interface Movement {
  id: string;
  kind: "in" | "out";
  label: string;
  detail: string;
  date: Date;
  amountMillimes: number;
}

export interface TopExpense {
  id: string;
  label: string;
  date: Date;
  amountMillimes: number;
}

const METHOD_FILL = ["chart-c3", "chart-in", "chart-out"] as const;

/** The Finances page's first tab: where the money comes from, where it goes, and what is left. */
export function FinanceOverview({
  t,
  locale,
  currency,
  flows,
  methods,
  openingMillimes,
  totals,
  topExpenses,
  movements,
  hrefs,
}: {
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
  flows: MonthFlow[];
  methods: MethodShare[];
  openingMillimes: number;
  totals: CycleTotals;
  topExpenses: TopExpense[];
  movements: Movement[];
  hrefs: { payments: string; expenses: string; lots: string };
}) {
  const money = (millimes: number) => formatAmount(millimes, currency);
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const methodTotal = methods.reduce((n, m) => n + m.totalMillimes, 0);
  const maxExpense = Math.max(1, ...topExpenses.map((e) => e.amountMillimes));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="h-card">{t.flowsByMonth}</h2>
            <div className="flex gap-4 text-[13px] text-muted">
              <span className="flex items-center gap-2">
                <span className="swatch chart-in" />
                {t.payments}
              </span>
              <span className="flex items-center gap-2">
                <span className="swatch chart-out" />
                {t.expenses}
              </span>
            </div>
          </div>
          {flows.length === 0 ? <p className="text-sm text-muted">{t.noMovementsYet}</p> : <FlowChart flows={flows} t={t} locale={locale} currency={currency} />}
        </section>

        <section className="card card-pad flex flex-col gap-4">
          <h2 className="h-card">{t.toCollect}</h2>
          <span className="num text-neg font-display text-[34px] leading-none">
            {formatMoney(totals.outstandingMillimes, currency)}{" "}
            <span className="font-sans text-sm text-muted">{currencySymbol(currency)}</span>
          </span>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">{t.kpiRate}</span>
              <b className="num">{rate} %</b>
            </div>
            <div className="bar">
              <div className="bar-fill bar-fill-pos" style={{ width: `${rate}%` }} />
            </div>
          </div>
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t.kpiExpected}</dt>
              <dd className="num font-semibold">{money(totals.expectedMillimes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t.kpiCollected}</dt>
              <dd className="num text-pos font-semibold">{money(totals.collectedMillimes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t.lotsPartialOrUnpaid}</dt>
              <dd className="num font-semibold">{totals.partial + totals.unpaid}</dd>
            </div>
          </dl>
          <Link href={hrefs.lots} className="btn btn-link mt-auto self-start">
            {t.seeLots}
          </Link>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="h-card">{t.balanceTrend}</h2>
            {flows.length > 0 && (
              <span className="num text-sm text-muted">
                {money(openingMillimes)} → <b className="text-ink">{money(flows[flows.length - 1].balanceMillimes)}</b>
              </span>
            )}
          </div>
          {flows.length === 0 ? (
            <p className="text-sm text-muted">{t.noMovementsYet}</p>
          ) : (
            <BalanceChart flows={flows} openingMillimes={openingMillimes} t={t} locale={locale} currency={currency} />
          )}
        </section>

        <section className="card card-pad flex flex-col gap-4">
          <h2 className="h-card">{t.byMethod}</h2>
          {methods.length === 0 ? (
            <p className="text-sm text-muted">{t.noPaymentsText}</p>
          ) : (
            <>
              <div className="bar-stack">
                {methods.map((m, i) => (
                  <div
                    key={m.method}
                    className={METHOD_FILL[i % METHOD_FILL.length]}
                    style={{ width: `${methodTotal ? (m.totalMillimes / methodTotal) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-3">
                {methods.map((m, i) => (
                  <li key={m.method} className="flex items-center gap-2.5 text-sm">
                    <span className={`swatch ${METHOD_FILL[i % METHOD_FILL.length]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t[`method${m.method}`]}</span>
                      <span className="text-xs text-muted">{interpolate(t.paymentsCount, { count: m.count })}</span>
                    </span>
                    <span className="num text-right">
                      <span className="block font-semibold">{money(m.totalMillimes)}</span>
                      <span className="text-xs text-muted">{percent(m.totalMillimes, methodTotal)} %</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card card-pad flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.topExpenses}</h2>
            <Link href={hrefs.expenses} className="btn btn-link">
              {t.seeAll}
            </Link>
          </div>
          {topExpenses.length === 0 ? (
            <p className="text-sm text-muted">{t.noExpensesYet}</p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {topExpenses.map((e) => (
                <li key={e.id} className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold" title={e.label}>
                      {e.label}
                    </span>
                    <span className="num shrink-0 font-semibold">{money(e.amountMillimes)}</span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill bar-fill-ochre" style={{ width: `${(e.amountMillimes / maxExpense) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.recentMovements}</h2>
            <Link href={hrefs.payments} className="btn btn-link">
              {t.seeAll}
            </Link>
          </div>
          {movements.length === 0 ? (
            <p className="text-sm text-muted">{t.noMovementsYet}</p>
          ) : (
            <ul className="flex flex-col">
              {movements.map((m) => (
                <li key={`${m.kind}-${m.id}`} className="move-row">
                  <span className={`move-icon ${m.kind === "in" ? "move-icon-in" : "move-icon-out"}`}>
                    <Icon name={m.kind === "in" ? "income" : "expense"} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" title={m.label}>
                      {m.label}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {formatDate(m.date)}
                      {m.detail && ` · ${m.detail}`}
                    </span>
                  </span>
                  <span className={`num shrink-0 text-sm font-bold ${m.kind === "in" ? "text-pos" : "text-neg"}`}>
                    {m.kind === "in" ? "+" : "−"}
                    {money(m.amountMillimes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function FlowChart({
  flows,
  t,
  locale,
  currency,
}: {
  flows: MonthFlow[];
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
}) {
  const max = Math.max(1, ...flows.flatMap((f) => [f.incomeMillimes, f.expenseMillimes]));
  const height = (millimes: number) => `${millimes ? Math.max(1, (millimes / max) * 100) : 0}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="chart-bars">
        {flows.map((f) => (
          <div
            key={f.month}
            className="chart-col"
            title={`${formatMonthShort(f.month, locale)}\n${t.payments} : ${formatAmount(f.incomeMillimes, currency)}\n${t.expenses} : ${formatAmount(f.expenseMillimes, currency)}`}
          >
            <span className="chart-bar chart-in" style={{ height: height(f.incomeMillimes) }} />
            <span className="chart-bar chart-out" style={{ height: height(f.expenseMillimes) }} />
          </div>
        ))}
      </div>
      <div className="chart-axis">
        {flows.map((f) => (
          <span key={f.month}>{formatMonthShort(f.month, locale)}</span>
        ))}
      </div>
    </div>
  );
}

/** The treasury balance from the cycle's start to the end of each month, as an area line. */
function BalanceChart({
  flows,
  openingMillimes,
  t,
  locale,
  currency,
}: {
  flows: MonthFlow[];
  openingMillimes: number;
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
}) {
  const values = [openingMillimes, ...flows.map((f) => f.balanceMillimes)];
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  // A 100×100 box stretched to the card; 6 units of headroom keep the line off the edges.
  const y = (v: number) => 94 - ((v - lo) / span) * 88;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const labels = [t.startOfCycle, ...flows.map((f) => formatMonthShort(f.month, locale))];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[180px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          <polygon className="chart-area" points={`0,100 ${line} 100,100`} />
          {lo < 0 && <line className="chart-zero" x1="0" x2="100" y1={y(0)} y2={y(0)} />}
          <polyline className="chart-line" points={line} />
        </svg>
        <span className="num absolute left-0 top-0 text-xs text-muted">{formatAmount(hi, currency)}</span>
        {lo < 0 && (
          <span className="num absolute bottom-0 left-0 text-xs text-neg">{formatAmount(lo, currency)}</span>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted">
        {labels.map((label, i) => (
          <span
            key={i}
            className={i === 0 || i === labels.length - 1 || labels.length <= 8 ? "" : "hidden md:inline"}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
