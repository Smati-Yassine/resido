import Link from "next/link";
import { loadWorkspace, lotRowsFor, activeLotsFor } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount, formatDateTime, formatMoney, formatMonthShort, percent } from "@/lib/format";
import { cycleRange } from "@/lib/cycle-view";
import { paymentLots } from "@/lib/lot-rows";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { getExpenseMonths, progressByBloc, totalsFromLotRows } from "@/lib/domain/overview/service";
import { collectedBy, collectionCurve, percentChange, spentBy, topDebtors } from "@/lib/domain/overview/finance";
import * as payments from "@/lib/domain/payments/service";
import { listAuditLog } from "@/lib/audit/log";
import { describeAuditEntry } from "@/lib/audit/describe";
import { findUsersByIds } from "@/lib/domain/users/service";
import { PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { PaymentButton } from "@/components/workspace/PaymentModal";
import { ExpenseButton } from "@/components/workspace/ExpenseModal";
import { SetupGuide } from "@/components/workspace/SetupGuide";
import { CollectionCurve, Delta, Donut, Gauge } from "@/components/dashboard/Charts";
import * as buildings from "@/lib/domain/buildings/service";
export default async function DashboardPage({ params, searchParams }: PageProps<"/residences/[residenceId]">) {
  const { session, residenceId, residence, cycle, cycles, currency, can, base } = await loadWorkspace(
    params,
    searchParams,
  );
  const { t, locale } = await getDictionary();

  // Until a first cycle opens, the dashboard walks a new residence through its setup.
  if (cycles.every((c) => c.status === "DRAFT")) {
    const [blocResult, lotResult] = await Promise.all([
      buildings.listBuildings(session, residenceId),
      activeLotsFor(session, residenceId),
    ]);
    const lotList = lotResult.ok ? lotResult.data : [];
    return (
      <>
        <PageHeader subtitle={residence.city} title={t.dashboard} />
        <SetupGuide
          t={t}
          base={base}
          residenceId={residenceId}
          counts={{
            blocs: blocResult.ok ? blocResult.data.length : 0,
            lots: lotList.length,
            assigned: lotList.filter((l) => l.ownerId).length,
          }}
          draft={cycles[0] ?? null}
          can={{
            lots: can("lots:*"),
            owners: can("owners:*"),
            cycles: can("cycles:manage"),
          }}
        />
      </>
    );
  }
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;
  if (cycle.status === "DRAFT") return <DraftCycle base={base} cycle={cycle} t={t} />;

  const previous = cycles.find((c) => c.id === cycle.previousCycleId && c.status !== "DRAFT") ?? null;
  const [rows, paymentResult, months, treasuries, previousRows, previousPayments, previousMonths, activity] =
    await Promise.all([
      lotRowsFor(session, residenceId, cycle.id),
      payments.listPaymentsForCycle(session, residenceId, cycle.id),
      getExpenseMonths(session, residenceId, cycle.id),
      computeAllTreasuries(residenceId),
      previous ? lotRowsFor(session, residenceId, previous.id) : Promise.resolve(null),
      previous ? payments.listPaymentsForCycle(session, residenceId, previous.id) : Promise.resolve(null),
      previous ? getExpenseMonths(session, residenceId, previous.id) : Promise.resolve(null),
      listAuditLog(residenceId, 5),
    ]);
  const people = new Map(
    (await findUsersByIds([...new Set(activity.map((e) => e.actorUserId))])).map((u) => [u.id, u.name]),
  );

  const totals = totalsFromLotRows(rows);
  const treasury = treasuries.get(cycle.id)!;
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);

  // The curve runs from the cycle's start to its end — or to today while it has none.
  const now = new Date();
  const end = cycle.endDate ?? now;
  const running = now.getTime() > cycle.startDate.getTime() && now.getTime() < end.getTime();

  // The cycle before, at the same point: while this one runs, the previous one
  // is cut as far into it as this one has gone — a half-year against a full
  // year would say nothing. A finished cycle compares with the whole previous one.
  const elapsed = Math.min(now.getTime(), end.getTime()) - cycle.startDate.getTime();
  const cutoff = previous && cycle.status === "OPEN" ? new Date(previous.startDate.getTime() + elapsed) : null;
  const previousTreasury = previous ? treasuries.get(previous.id) : undefined;
  const before =
    previous && previousRows && previousPayments?.ok && previousTreasury
      ? (() => {
          const expected = totalsFromLotRows(previousRows).expectedMillimes;
          const collected = collectedBy(previousPayments.data, previous.id, cutoff);
          const spent = spentBy(previousMonths?.flatMap((m) => m.items) ?? [], cutoff);
          return {
            expectedMillimes: expected,
            collectedMillimes: collected,
            outstandingMillimes: expected - collected,
            balanceMillimes: previousTreasury.openingBalanceMillimes + collected - spent,
          };
        })()
      : null;
  const vs = previous ? interpolate(cutoff ? t.vsPreviousToDate : t.vsPrevious, { name: previous.name }) : "";
  const curve = collectionCurve(
    paymentResult.ok ? paymentResult.data : [],
    cycle.id,
    cycle.startDate,
    running ? now : end,
  );

  const blocs = progressByBloc(rows);
  const debtors = topDebtors(rows, 6);
  const maxDebt = Math.max(1, ...debtors.map((d) => d.outstandingMillimes));
  const maxMonth = Math.max(1, ...months.map((m) => m.totalMillimes));
  const cycleQuery = `?cycle=${cycle.id}`;
  const money = (millimes: number) => formatAmount(millimes, currency);
  const blocGroups = blocs.map((b) => ({ ...b, rows: rows.filter((r) => r.blocId === b.blocId) }));

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={cycleRange(cycle, t)}
        title={t.dashboard}
        // A closed cycle stays correctable, so the buttons stay too.
        actions={
          <>
            {can("expenses:create") && <ExpenseButton residenceId={residenceId} variant="ghost" />}
            {can("payments:create") && (
              <PaymentButton residenceId={residenceId} lots={paymentLots(rows)} label={t.addPayment} />
            )}
          </>
        }
      />

      {/* Hero: the collection rate, then the four figures that matter, each against the cycle before. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <section className="card-night flex flex-wrap items-center gap-5 p-6">
          <Gauge value={rate} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-night-soft">{t.dashCollection}</h2>
            <span className="num whitespace-nowrap text-[22px] font-bold leading-tight">
              {money(totals.collectedMillimes)}
            </span>
            <span className="whitespace-nowrap text-sm text-night-soft">
              {interpolate(t.dashOfExpected, { expected: money(totals.expectedMillimes) })}
            </span>
            {before && previous && (
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <Delta
                  onNight
                  unit=" pts"
                  value={rate - percent(before.collectedMillimes, before.expectedMillimes)}
                  label=""
                />
                <span className="text-xs text-night-soft">{vs}</span>
              </span>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Figure
            label={t.kpiExpected}
            value={formatMoney(totals.expectedMillimes, currency)}
            unit={currencySymbol(currency)}
            foot={`${totals.lotCount} ${t.lotsWord}`}
            delta={<Delta value={percentChange(totals.expectedMillimes, before?.expectedMillimes)} label={vs} />}
          />
          <Figure
            label={t.kpiCollected}
            value={formatMoney(totals.collectedMillimes, currency)}
            unit={currencySymbol(currency)}
            valueClassName="text-pos"
            delta={<Delta value={percentChange(totals.collectedMillimes, before?.collectedMillimes)} label={vs} />}
          />
          <Figure
            label={t.kpiOutstanding}
            value={formatMoney(totals.outstandingMillimes, currency)}
            unit={currencySymbol(currency)}
            valueClassName="text-neg"
            foot={interpolate(t.lotsConcerned, { count: totals.partial + totals.unpaid })}
            delta={
              <Delta
                value={percentChange(totals.outstandingMillimes, before?.outstandingMillimes)}
                label={vs}
                goodWhenUp={false}
              />
            }
          />
          <Figure
            label={cycle.status === "CLOSED" ? t.closingBalance : t.kpiBalance}
            value={formatMoney(treasury.closingBalanceMillimes, currency)}
            unit={currencySymbol(currency)}
            foot={interpolate(t.startWas, { amount: money(treasury.openingBalanceMillimes) })}
            delta={<Delta value={percentChange(treasury.closingBalanceMillimes, before?.balanceMillimes)} label={vs} />}
            href={`${base}/finances${cycleQuery}`}
          />
        </div>
      </div>

      {/* Collection over time, and where the lots stand. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-4 xl:col-span-2">
          <div className="flex flex-col gap-1">
            <h2 className="h-card">{t.curveTitle}</h2>
            <p className="text-[13px] text-muted">{t.curveHint}</p>
          </div>
          <CollectionCurve
            points={curve}
            expectedMillimes={totals.expectedMillimes}
            start={cycle.startDate}
            end={running ? now : end}
            today={null}
            t={t}
            locale={locale}
            currency={currency}
          />
        </section>

        <section className="card card-pad flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.lotState}</h2>
            <Link href={`${base}/lots${cycleQuery}`} className="btn btn-link">
              {t.seeLots}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Donut
              total={totals.lotCount}
              caption={t.lots}
              segments={[
                { className: "fill-paid", value: totals.paid },
                { className: "fill-partial", value: totals.partial },
                { className: "fill-unpaid", value: totals.unpaid },
              ]}
            />
            <ul className="flex min-w-[150px] flex-1 flex-col gap-3">
              {(
                [
                  ["fill-paid", t.paidPlural, totals.paid],
                  ["fill-partial", t.partialPlural, totals.partial],
                  ["fill-unpaid", t.unpaidPlural, totals.unpaid],
                ] as const
              ).map(([fill, label, count]) => (
                <li key={fill} className="flex items-center gap-2.5 text-sm">
                  <span className={`swatch ${fill}`} />
                  <span className="flex-1">{label}</span>
                  <b className="num">{count}</b>
                  <span className="num w-10 text-right text-xs text-muted">{percent(count, totals.lotCount)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* The residence at a glance: every lot as a tile, and who owes the most. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-4 xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="h-card">{t.lotsMap}</h2>
              <p className="text-[13px] text-muted">{t.lotsMapHint}</p>
            </div>
            <div className="flex gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-paid" />
                {t.paidPlural}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-partial" />
                {t.partialPlural}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-unpaid" />
                {t.unpaidPlural}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            {blocGroups.map((b) => (
              <div key={b.blocId ?? ""} className="flex flex-col gap-2">
                <span className="text-[13px] font-bold text-ink-2">
                  {b.name}{" "}
                  <span className="font-medium text-muted">
                    ·{" "}
                    {interpolate(t.blocProgress, {
                      rate: percent(b.collectedMillimes, b.expectedMillimes),
                      paid: b.paidCount,
                      count: b.lotCount,
                    })}
                  </span>
                </span>
                <div className="lot-map">
                  {b.rows.map((r) => (
                    <Link
                      key={r.assessmentId}
                      href={`${base}/lots${cycleQuery}`}
                      className="lot-tile"
                      data-status={r.status}
                      title={interpolate(t.lotTileTitle, {
                        code: r.code,
                        owner: r.ownerName ?? t.noOwnerLabel,
                        amount: money(r.dueMillimes - r.paidMillimes),
                      })}
                    >
                      {r.code}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card card-pad flex flex-col gap-4">
          <h2 className="h-card">{t.topDebtors}</h2>
          {debtors.length === 0 ? (
            <p className="text-sm text-muted">{t.noDebt}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {debtors.map((d) => (
                <li key={d.ownerId ?? "none"} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold ${d.ownerId ? "" : "text-muted"}`}>
                        {d.ownerName ?? t.noOwnerLabel}
                      </span>
                      <span className="block truncate text-xs text-muted">{d.lotCodes.join(", ")}</span>
                    </span>
                    <span className="num shrink-0 font-bold text-neg">{money(d.outstandingMillimes)}</span>
                  </div>
                  <div className="bar">
                    <div
                      className="bar-fill bar-fill-ochre"
                      style={{ width: `${(d.outstandingMillimes / maxDebt) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">{t.debtTotal}</span>
            <b className="num text-neg">{money(totals.outstandingMillimes)}</b>
          </div>
        </section>
      </div>

      {/* Money out, and what happened lately. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card card-pad flex flex-col gap-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.expensesByMonth}</h2>
            <Link href={`${base}/finances?tab=expenses&cycle=${cycle.id}`} className="btn btn-link">
              {t.allExpenses} →
            </Link>
          </div>
          {months.length === 0 ? (
            <p className="text-sm text-muted">{t.noExpensesYet}</p>
          ) : (
            // The chart grows with the card, level with the activity list beside it.
            <div className="flex flex-1 flex-col gap-2">
              <div className="chart-bars h-auto min-h-[200px] flex-1">
                {months.map((m) => (
                  <div
                    key={m.month}
                    className="chart-col"
                    title={`${formatMonthShort(m.month, locale)} · ${money(m.totalMillimes)}`}
                  >
                    <span
                      className="chart-bar chart-out"
                      style={{ height: `${Math.max(1, (m.totalMillimes / maxMonth) * 100)}%`, width: "min(34px, 70%)" }}
                    />
                  </div>
                ))}
              </div>
              <div className="chart-axis">
                {months.map((m) => (
                  <span key={m.month}>{formatMonthShort(m.month, locale)}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card card-pad flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.recentActivity}</h2>
            <Link href={`${base}/settings?tab=journal${cycleQuery.replace("?", "&")}`} className="btn btn-link">
              {t.seeJournal}
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">{t.noActivity}</p>
          ) : (
            <ul className="flex flex-col">
              {activity.map((entry) => (
                <li key={entry.id} className="move-row items-start">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t[`audit${entry.action}`]}</span>
                    <span className="block truncate text-xs text-muted">{describeAuditEntry(entry, t, currency)}</span>
                    <span className="block text-[11px] text-muted">
                      {people.get(entry.actorUserId) ?? t.someone} · {formatDateTime(entry.createdAt, locale)}
                    </span>
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

/** One headline figure: label, amount, an optional note, and its change against the cycle before. */
function Figure({
  label,
  value,
  unit,
  foot,
  delta,
  valueClassName = "",
  href,
}: {
  label: string;
  value: string;
  unit: string;
  foot?: string;
  delta?: React.ReactNode;
  valueClassName?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="kpi-label">{label}</span>
        {delta}
      </div>
      <span className={`kpi-value ${valueClassName}`}>
        {value} <span className="text-sm font-semibold text-muted">{unit}</span>
      </span>
      {foot && <span className="kpi-foot">{foot}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-lift kpi no-underline">
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}
