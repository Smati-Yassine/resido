import { Page, Text, View } from "@react-pdf/renderer";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatDate, formatMonth, percent } from "@/lib/format";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import type { PrintData, PrintPayment } from "@/lib/print/load";
import { StackedBar } from "./charts";
import {
  type Column,
  type PdfCtx,
  Footer,
  GroupRow,
  money,
  SheetHeader,
  StatusPill,
  Swatch,
  TableHead,
  TableRow,
} from "./parts";
import { C, S } from "./theme";

export const METHOD_COLORS: Record<PaymentMethod, string> = {
  CASH: C.olive,
  BANK_TRANSFER: C.primary,
  CHECK: C.ochreLight,
};

/**
 * The residence's ledger, landscape: every lot by bloc with its owners,
 * phones, what it owes and how it paid; a subtotal per bloc, then the total.
 */
export function PropertyPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t } = ctx;
  const billed = data.property.billed;
  const columns: Column[] = billed
    ? [
        { label: t.colLot, width: 66 },
        { label: t.ownersLabel, flex: 2.2 },
        { label: t.colPhone, flex: 1.1 },
        { label: t.colCharge, width: 70, align: "right" },
        { label: t.colPaid, width: 70, align: "right" },
        { label: t.colRemaining, width: 70, align: "right" },
        { label: t.colStatus, width: 60, align: "center" },
        { label: t.colMethods, flex: 1.1 },
      ]
    : [
        { label: t.colLot, width: 80 },
        { label: t.ownersLabel, flex: 2.4 },
        { label: t.colPhone, flex: 1.2 },
        { label: t.colCharge, width: 90, align: "right" },
      ];
  const sum = (lots: { chargeMillimes: number; paidMillimes: number }[], key: "chargeMillimes" | "paidMillimes") =>
    lots.reduce((n, l) => n + l[key], 0);
  const all = data.byBloc.flatMap((b) => b.lots);
  const totals = (lots: typeof all) => {
    const charge = sum(lots, "chargeMillimes");
    const paid = sum(lots, "paidMillimes");
    return billed ? [money(ctx, charge), money(ctx, paid), money(ctx, charge - paid)] : [money(ctx, charge)];
  };

  return (
    <Page size="A4" orientation="landscape" style={S.page}>
      <SheetHeader ctx={ctx} title={title} />
      <TableHead columns={columns} />
      {data.byBloc.map((bloc) => (
        <View key={bloc.name}>
          <GroupRow label={bloc.name} detail={interpolate(t.lotsCount, { count: bloc.lots.length })} />
          {bloc.lots.map((l) => {
            const owed = l.chargeMillimes - l.paidMillimes;
            const base = [l.code, l.owners || "—", l.phones, money(ctx, l.chargeMillimes)];
            return (
              <TableRow
                key={l.code}
                columns={columns}
                cells={
                  billed
                    ? [
                        ...base,
                        money(ctx, l.paidMillimes),
                        <Text key="owed" style={{ fontWeight: 700, color: owed > 0 ? C.neg : C.ink }}>
                          {money(ctx, owed)}
                        </Text>,
                        l.status ? <StatusPill key="s" status={l.status} label={t[`status${l.status}`]} /> : "",
                        l.methods.map((m) => t[`method${m}`]).join(", "),
                      ]
                    : base
                }
              />
            );
          })}
          <TableRow
            kind="subtotal"
            columns={columns}
            cells={[`${t.subtotal}`, bloc.name, "", ...totals(bloc.lots), ...(billed ? ["", ""] : [])]}
          />
        </View>
      ))}
      <TableRow
        kind="total"
        columns={columns}
        cells={[
          t.grandTotal,
          interpolate(t.lotsCount, { count: all.length }),
          "",
          ...totals(all),
          ...(billed ? [`${percent(sum(all, "paidMillimes"), sum(all, "chargeMillimes"))} %`, ""] : []),
        ]}
      />
      <Footer ctx={ctx} />
    </Page>
  );
}

/** The cycle's payments by month, oldest first, then the totals by method. */
export function PaymentsPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t, locale } = ctx;
  const payments = data.payments;
  const columns: Column[] = [
    { label: t.colDate, width: 54 },
    { label: t.colLots, flex: 1.5 },
    { label: t.colPayer, flex: 1.2 },
    { label: t.colMethod, width: 56 },
    { label: t.colNote, flex: 1.5 },
    { label: t.total, width: 66, align: "right" },
  ];
  const months = new Map<string, PrintPayment[]>();
  for (const p of payments) {
    const key = p.date.toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p]);
  }
  const total = payments.reduce((n, p) => n + p.amountMillimes, 0);

  return (
    <Page size="A4" style={S.page}>
      <SheetHeader ctx={ctx} title={title} />
      {payments.length === 0 ? (
        <Text style={S.muted}>{t.noPaymentsText}</Text>
      ) : (
        <>
          <TableHead columns={columns} />
          {[...months.entries()].map(([month, list]) => (
            <View key={month}>
              <GroupRow
                label={capitalize(formatMonth(month, locale))}
                detail={interpolate(t.paymentsCount, { count: list.length })}
              />
              {list.map((p) => (
                <TableRow
                  key={p.id}
                  columns={columns}
                  cells={[
                    formatDate(p.date),
                    <Text key="lots" style={{ fontWeight: 700 }}>
                      {p.lots}
                    </Text>,
                    p.payer,
                    t[`method${p.method}`],
                    p.note,
                    money(ctx, p.amountMillimes),
                  ]}
                />
              ))}
              <TableRow
                kind="subtotal"
                columns={columns}
                cells={[
                  t.subtotal,
                  "",
                  "",
                  "",
                  "",
                  money(
                    ctx,
                    list.reduce((n, p) => n + p.amountMillimes, 0),
                  ),
                ]}
              />
            </View>
          ))}
          <TableRow
            kind="total"
            columns={columns}
            cells={[t.total, interpolate(t.paymentsCount, { count: payments.length }), "", "", "", money(ctx, total)]}
          />
          <MethodsBox ctx={ctx} data={data} />
        </>
      )}
      <Footer ctx={ctx} />
    </Page>
  );
}

/** How the cycle's income was paid: one stacked bar and its legend. */
export function MethodsBox({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t } = ctx;
  const total = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  return (
    <View wrap={false} style={[S.card, { marginTop: 14, alignSelf: "flex-end", width: 260 }]}>
      <Text style={S.cardTitle}>{t.byMethodTitle}</Text>
      <View style={{ marginTop: 6, marginBottom: 8 }}>
        <StackedBar parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))} />
      </View>
      <View style={{ gap: 4 }}>
        {data.methods.map((m) => (
          <Swatch
            key={m.method}
            color={METHOD_COLORS[m.method]}
            label={`${t[`method${m.method}`]} · ${m.count}`}
            value={`${money(ctx, m.totalMillimes)}  ${percent(m.totalMillimes, total)} %`}
          />
        ))}
      </View>
    </View>
  );
}

/** The cycle's expenses month by month, with subtotals. */
export function ExpensesPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t, locale } = ctx;
  const months = data.expenseMonths;
  const columns: Column[] = [
    { label: t.colDate, width: 54 },
    { label: t.colLabel, flex: 2.6 },
    { label: t.colReference, flex: 1 },
    { label: t.total, width: 72, align: "right" },
  ];
  const count = months.reduce((n, m) => n + m.items.length, 0);
  return (
    <Page size="A4" style={S.page}>
      <SheetHeader ctx={ctx} title={title} />
      {months.length === 0 ? (
        <Text style={S.muted}>{t.noExpensesYet}</Text>
      ) : (
        <>
          <TableHead columns={columns} />
          {months.map((mo) => (
            <View key={mo.month}>
              <GroupRow
                label={capitalize(formatMonth(mo.month, locale))}
                detail={interpolate(t.expensesCount, { count: mo.items.length })}
              />
              {mo.items.map((e) => (
                <TableRow
                  key={e.id}
                  columns={columns}
                  cells={[
                    formatDate(e.date),
                    <Text key="label" style={{ fontWeight: 700 }}>
                      {e.label}
                    </Text>,
                    e.reference ?? "",
                    money(ctx, e.amountMillimes),
                  ]}
                />
              ))}
              <TableRow kind="subtotal" columns={columns} cells={[t.subtotal, "", "", money(ctx, mo.totalMillimes)]} />
            </View>
          ))}
          <TableRow
            kind="total"
            columns={columns}
            cells={[
              t.total,
              interpolate(t.expensesCount, { count }),
              "",
              money(
                ctx,
                months.reduce((n, m) => n + m.totalMillimes, 0),
              ),
            ]}
          />
        </>
      )}
      <Footer ctx={ctx} />
    </Page>
  );
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
