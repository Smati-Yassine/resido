import { Fragment } from "react";
import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatDate, formatMoney, formatMonth, percent } from "@/lib/format";
import type { ExpenseMonth } from "@/lib/domain/overview/service";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import type { PrintData, PrintPayment } from "@/lib/print/load";

/**
 * Printed documents: plain A4 sheets built for paper — thin rules, tabular
 * figures, group and total rows — in the residence's currency. Each section
 * stands alone, so a document is any sequence of them.
 */

type Ctx = { t: Dictionary; locale: Locale; currency: CurrencyCode };

export function DocHeader({
  ctx,
  title,
  residence,
  cycleLine,
}: {
  ctx: Ctx;
  title: string;
  residence: { name: string; city: string };
  cycleLine: string;
}) {
  const { t } = ctx;
  return (
    <header className="print-header">
      <div className="flex items-center gap-3">
        <span className="print-mark">R</span>
        <div className="flex flex-col">
          <span className="print-residence">{residence.name}</span>
          <span className="print-muted">{residence.city}</span>
        </div>
      </div>
      <div className="flex flex-col items-end text-right">
        <h1 className="print-title">{title}</h1>
        <span className="print-muted">{cycleLine}</span>
        <span className="print-muted">
          {interpolate(t.printedOn, { date: formatDate(new Date()) })} · {currencySymbol(ctx.currency)}
        </span>
      </div>
    </header>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="print-section-title">{children}</h2>;
}

/** The residence's ledger: every lot by bloc, its owners, what it owes and how it paid. */
export function PropertySheet({ ctx, data, billed }: { ctx: Ctx; data: PrintData; billed: boolean }) {
  const { t, currency } = ctx;
  const m = (v: number) => formatMoney(v, currency);
  const method = (list: PaymentMethod[]) => list.map((x) => t[`method${x}`]).join(", ");
  const sum = (list: { chargeMillimes: number; paidMillimes: number }[], k: "chargeMillimes" | "paidMillimes") =>
    list.reduce((n, l) => n + l[k], 0);
  const all = data.byBloc.flatMap((b) => b.lots);

  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>{t.colBloc}</th>
          <th>{t.colLot}</th>
          <th>{t.ownersLabel}</th>
          <th>{t.colPhone}</th>
          <th className="num">{t.colCharge}</th>
          {billed && <th className="num">{t.colPaid}</th>}
          {billed && <th className="num">{t.colRemaining}</th>}
          {billed && <th>{t.colStatus}</th>}
          {billed && <th>{t.colMethods}</th>}
        </tr>
      </thead>
      <tbody>
        {data.byBloc.map((bloc) => (
          <Fragment key={bloc.name}>
            {bloc.lots.map((l, i) => (
              <tr key={l.code} data-status={billed ? (l.status ?? undefined) : undefined}>
                {i === 0 && (
                  <td rowSpan={bloc.lots.length} className="print-bloc">
                    {bloc.name}
                  </td>
                )}
                <td className="font-semibold">{l.code}</td>
                <td>{l.owners || "—"}</td>
                <td>{l.phones}</td>
                <td className="num">{m(l.chargeMillimes)}</td>
                {billed && <td className="num">{m(l.paidMillimes)}</td>}
                {billed && <td className="num font-semibold">{m(l.chargeMillimes - l.paidMillimes)}</td>}
                {billed && <td>{l.status ? t[`status${l.status}`] : ""}</td>}
                {billed && <td>{method(l.methods)}</td>}
              </tr>
            ))}
            <tr className="print-subtotal">
              <td colSpan={4}>
                {t.subtotal} · {bloc.name}
              </td>
              <td className="num">{m(sum(bloc.lots, "chargeMillimes"))}</td>
              {billed && <td className="num">{m(sum(bloc.lots, "paidMillimes"))}</td>}
              {billed && (
                <td className="num">{m(sum(bloc.lots, "chargeMillimes") - sum(bloc.lots, "paidMillimes"))}</td>
              )}
              {billed && <td colSpan={2} />}
            </tr>
          </Fragment>
        ))}
        <tr className="print-total">
          <td colSpan={4}>
            {t.grandTotal} · {interpolate(t.lotsCount, { count: all.length })}
          </td>
          <td className="num">{m(sum(all, "chargeMillimes"))}</td>
          {billed && <td className="num">{m(sum(all, "paidMillimes"))}</td>}
          {billed && <td className="num">{m(sum(all, "chargeMillimes") - sum(all, "paidMillimes"))}</td>}
          {billed && <td colSpan={2}>{percent(sum(all, "paidMillimes"), sum(all, "chargeMillimes"))} %</td>}
        </tr>
      </tbody>
    </table>
  );
}

/** The cycle's payments by month, oldest first, then the totals by method. */
export function PaymentsSheet({ ctx, payments }: { ctx: Ctx; payments: PrintPayment[] }) {
  const { t, locale, currency } = ctx;
  const m = (v: number) => formatMoney(v, currency);
  if (payments.length === 0) return <p className="print-muted">{t.noPaymentsText}</p>;
  const months = new Map<string, PrintPayment[]>();
  for (const p of payments) {
    const key = p.date.toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p]);
  }
  const total = payments.reduce((n, p) => n + p.amountMillimes, 0);
  const byMethod = new Map<PaymentMethod, { count: number; amount: number }>();
  for (const p of payments) {
    const cur = byMethod.get(p.method) ?? { count: 0, amount: 0 };
    byMethod.set(p.method, { count: cur.count + 1, amount: cur.amount + p.amountMillimes });
  }

  return (
    <>
      <table className="print-table">
        <thead>
          <tr>
            <th>{t.colDate}</th>
            <th>{t.colLots}</th>
            <th>{t.colPayer}</th>
            <th>{t.colMethod}</th>
            <th>{t.colNote}</th>
            <th className="num">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {[...months.entries()].map(([month, list]) => (
            <Fragment key={month}>
              <tr className="print-group">
                <td colSpan={6}>{formatMonth(month, locale)}</td>
              </tr>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td className="font-semibold">{p.lots}</td>
                  <td>{p.payer}</td>
                  <td>{t[`method${p.method}`]}</td>
                  <td>{p.note}</td>
                  <td className="num">{m(p.amountMillimes)}</td>
                </tr>
              ))}
              <tr className="print-subtotal">
                <td colSpan={5}>
                  {t.subtotal} · {interpolate(t.paymentsCount, { count: list.length })}
                </td>
                <td className="num">{m(list.reduce((n, p) => n + p.amountMillimes, 0))}</td>
              </tr>
            </Fragment>
          ))}
          <tr className="print-total">
            <td colSpan={5}>
              {t.grandTotal} · {interpolate(t.paymentsCount, { count: payments.length })}
            </td>
            <td className="num">{m(total)}</td>
          </tr>
        </tbody>
      </table>
      <table className="print-table print-table-narrow">
        <thead>
          <tr>
            <th>{t.byMethodTitle}</th>
            <th className="num">{t.payments}</th>
            <th className="num">{t.total}</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {[...byMethod.entries()].map(([method, v]) => (
            <tr key={method}>
              <td>{t[`method${method}`]}</td>
              <td className="num">{v.count}</td>
              <td className="num">{m(v.amount)}</td>
              <td className="num">{percent(v.amount, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The cycle's expenses month by month, with subtotals. */
export function ExpensesSheet({ ctx, months }: { ctx: Ctx; months: ExpenseMonth[] }) {
  const { t, locale, currency } = ctx;
  const m = (v: number) => formatMoney(v, currency);
  if (months.length === 0) return <p className="print-muted">{t.noExpensesYet}</p>;
  const count = months.reduce((n, mo) => n + mo.items.length, 0);
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>{t.colDate}</th>
          <th>{t.colLabel}</th>
          <th>{t.colReference}</th>
          <th className="num">{t.total}</th>
        </tr>
      </thead>
      <tbody>
        {months.map((mo) => (
          <Fragment key={mo.month}>
            <tr className="print-group">
              <td colSpan={4}>{formatMonth(mo.month, locale)}</td>
            </tr>
            {mo.items.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.date)}</td>
                <td className="font-semibold">{e.label}</td>
                <td>{e.reference ?? ""}</td>
                <td className="num">{m(e.amountMillimes)}</td>
              </tr>
            ))}
            <tr className="print-subtotal">
              <td colSpan={3}>
                {t.subtotal} · {interpolate(t.expensesCount, { count: mo.items.length })}
              </td>
              <td className="num">{m(mo.totalMillimes)}</td>
            </tr>
          </Fragment>
        ))}
        <tr className="print-total">
          <td colSpan={3}>
            {t.grandTotal} · {interpolate(t.expensesCount, { count })}
          </td>
          <td className="num">{m(months.reduce((n, mo) => n + mo.totalMillimes, 0))}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Start + payments − expenses = balance, as four boxes. */
export function TreasuryStrip({ ctx, data, closed }: { ctx: Ctx; data: PrintData; closed: boolean }) {
  const { t, currency } = ctx;
  const tr = data.treasury;
  const cells: [string, number][] = [
    [t.startBalance, tr.openingBalanceMillimes],
    [t.plusIncome, tr.incomeMillimes],
    [t.minusExpenses, tr.expenseMillimes],
    [`= ${closed ? t.closingBalance : t.currentBalance}`, tr.closingBalanceMillimes],
  ];
  return (
    <div className="print-figures">
      {cells.map(([label, value]) => (
        <div key={label} className="print-figure">
          <span className="print-figure-label">{label}</span>
          <span className="print-figure-value">{formatMoney(value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

/** Billed, collected, still owed, collection rate, balance. */
export function KeyFigures({ ctx, data }: { ctx: Ctx; data: PrintData }) {
  const { t, currency } = ctx;
  const { totals, treasury } = data;
  const cells: [string, string][] = [
    [t.kpiExpected, formatMoney(totals.expectedMillimes, currency)],
    [t.kpiCollected, formatMoney(totals.collectedMillimes, currency)],
    [t.kpiOutstanding, formatMoney(totals.outstandingMillimes, currency)],
    [t.kpiRate, `${percent(totals.collectedMillimes, totals.expectedMillimes)} %`],
    [t.kpiBalance, formatMoney(treasury.closingBalanceMillimes, currency)],
  ];
  return (
    <div className="print-figures">
      {cells.map(([label, value]) => (
        <div key={label} className="print-figure">
          <span className="print-figure-label">{label}</span>
          <span className="print-figure-value">{value}</span>
        </div>
      ))}
    </div>
  );
}
