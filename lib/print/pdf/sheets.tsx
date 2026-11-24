import { Page, Text, View } from "@react-pdf/renderer";
import { countText, interpolate } from "@/lib/i18n/dictionaries";
import { formatDate, formatMonth, percent } from "@/lib/format";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import type { PrintData, PrintLot, PrintPayment } from "@/lib/print/load";
import type { Expense } from "@/lib/domain/expenses/schema";
import { StackedBar } from "./charts";
import { fitList, fontFor, type FitLine } from "./fit";
import {
  amount,
  blocLabel,
  type Column,
  Dot,
  FIGURES,
  type Figure,
  Figures,
  LIST_HEAD,
  ListColumn,
  type ListLine,
  money,
  type PdfCtx,
  SHEET_HEADER,
  SheetHeader,
  StatusPill,
} from "./parts";
import { C, S } from "./theme";

export const METHOD_COLORS: Record<PaymentMethod, string> = {
  CASH: C.olive,
  BANK_TRANSFER: C.primary,
  CHECK: C.ochreLight,
};

/** A4 portrait, in points, and the room a page's padding leaves. */
const PAGE_HEIGHT = 841.89;
const PAGE_PADDING = 60;
const GUTTER = 16;

/** Rows from 14 pt down to 11 pt before a second column; 7.5 pt (6 pt type) at the very least. */
const FIT = { comfortable: 14, readable: 11, min: 7.5 };

/** The height left for a list's lines under the header, the figures and the column titles. */
const LIST_HEIGHT = PAGE_HEIGHT - PAGE_PADDING - SHEET_HEADER - FIGURES - LIST_HEAD - 4;

/** A list document: its items (group bands, rows, total), and how they print, in full or compact. */
interface ListDoc<I extends FitLine> {
  items: I[];
  /** The band a group repeats at the top of the next column. */
  continued: (group: I) => I;
  columns: (compact: boolean, font: number) => Column[];
  line: (item: I, compact: boolean, font: number) => ListLine;
}

/**
 * A list on one A4 page (lib/print/pdf/fit.ts): one column with every detail,
 * or two side by side with the essentials when the list is long. Only a list
 * too long to read on one page runs to more, laid out the same.
 */
function ListPages<I extends FitLine>({
  ctx,
  title,
  figures,
  doc,
  empty,
}: {
  ctx: PdfCtx;
  title: string;
  figures: Figure[];
  doc: ListDoc<I>;
  empty: string;
}) {
  const fit = fitList(doc.items, LIST_HEIGHT, { maxColumns: 2, ...FIT }, doc.continued);
  const font = fontFor(fit.row);
  const compact = fit.columns > 1;
  const columns = doc.columns(compact, font);
  const pages: I[][][] = [];
  for (let i = 0; i < fit.chunks.length; i += fit.columns) pages.push(fit.chunks.slice(i, i + fit.columns));
  if (pages.length === 0) pages.push([]);

  return pages.map((chunks, p) => (
    <Page key={p} size="A4" style={S.page}>
      <SheetHeader ctx={ctx} title={title} />
      <Figures figures={figures} />
      {doc.items.length === 0 ? (
        <Text style={[S.muted, { marginTop: 8 }]}>{empty}</Text>
      ) : (
        <View style={{ flexDirection: "row", gap: GUTTER }}>
          {Array.from({ length: fit.columns }, (_, i) =>
            chunks[i] ? (
              <ListColumn
                key={i}
                columns={columns}
                lines={chunks[i].map((item) => doc.line(item, compact, font))}
                row={fit.row}
                font={font}
              />
            ) : (
              <View key={i} style={{ flex: 1 }} />
            ),
          )}
        </View>
      )}
    </Page>
  ));
}

/** Room for a date ("01/01/2026") at a type size. */
const dateWidth = (font: number) => Math.ceil(font * 5.1) + 6;

/** The currency's symbol, for the figures' units. */
const unitOf = (ctx: PdfCtx) => amount(ctx, 0).split(" ").pop()!;

/** Payment methods as coloured dots, the methods named in the figures above. */
function MethodDots({ methods, size }: { methods: PaymentMethod[]; size: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {methods.map((m) => (
        <Dot key={m} color={METHOD_COLORS[m]} size={size} />
      ))}
    </View>
  );
}

/** How the cycle's income was paid: a bar, and each method's share — a figure of the strip. */
function methodsFigure(ctx: PdfCtx, data: PrintData, flex: number): Figure {
  const { t } = ctx;
  const total = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  return {
    label: t.byMethodTitle,
    value: "",
    flex,
    body: (
      <View style={{ marginTop: 4, gap: 4 }}>
        <StackedBar
          height={5}
          parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))}
        />
        <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
          {data.methods.map((m) => (
            <View key={m.method} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Dot color={METHOD_COLORS[m.method]} />
              <Text style={{ fontSize: 6.8, color: C.ink2 }}>
                {t[`method${m.method}`]} <Text style={{ fontWeight: 800 }}>{percent(m.totalMillimes, total)} %</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
    ),
  };
}

/* ---------- Lots and owners ---------- */

type LotItem =
  | { kind: "group"; key: string; name: string; count: number; charge: number; paid: number; more?: boolean }
  | { kind: "row"; key: string; lot: PrintLot }
  | { kind: "total"; key: string; count: number; charge: number; paid: number };

/**
 * Every lot by bloc on one page: owners, phones, what it owes and how it paid,
 * each bloc's band with its subtotal, then the total. Not billed yet: charges only.
 */
export function PropertyPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t } = ctx;
  const billed = data.property.billed;
  const sum = (lots: PrintLot[]) => ({
    charge: lots.reduce((n, l) => n + l.chargeMillimes, 0),
    paid: lots.reduce((n, l) => n + l.paidMillimes, 0),
  });
  const all = data.byBloc.flatMap((b) => b.lots);
  const items: LotItem[] = [
    ...data.byBloc.flatMap((bloc, b): LotItem[] => [
      { kind: "group", key: `g${b}`, name: blocLabel(ctx, bloc.name), count: bloc.lots.length, ...sum(bloc.lots) },
      ...bloc.lots.map((lot, i): LotItem => ({ kind: "row", key: `r${b}-${i}`, lot })),
    ]),
    { kind: "total", key: "total", count: all.length, ...sum(all) },
  ];
  const whole = sum(all);
  // The lot column fits the longest code ("A11", "Commerce 12"), within reason.
  const longest = Math.max(3, ...all.map((l) => l.code.length));
  const lotWidth = (font: number, most: number) => Math.min(most, Math.ceil(longest * font * 0.62) + 8);
  const unit = unitOf(ctx);
  const count = (status: PrintLot["status"]) => all.filter((l) => l.status === status).length;
  const figures: Figure[] = billed
    ? [
        {
          label: t.lots,
          value: String(all.length),
          sub: [
            countText(t, ctx.locale, "lotsPaidCount", count("PAID")),
            countText(t, ctx.locale, "lotsPartialCount", count("PARTIAL")),
            countText(t, ctx.locale, "lotsUnpaidCount", count("UNPAID")),
          ].join(" · "),
          flex: 1.2,
        },
        { label: t.kpiExpected, value: money(ctx, whole.charge), unit, accent: C.primary },
        { label: t.kpiCollected, value: money(ctx, whole.paid), unit, accent: C.olive },
        { label: t.kpiOutstanding, value: money(ctx, whole.charge - whole.paid), unit, accent: C.ochre },
        {
          label: t.kpiRate,
          value: `${percent(whole.paid, whole.charge)}`,
          unit: "%",
          flex: 1.3,
          body: (
            <View>
              <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                {percent(whole.paid, whole.charge)}
                <Text style={{ fontFamily: "Manrope", fontSize: 7, color: C.muted }}> %</Text>
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                {(["CASH", "BANK_TRANSFER", "CHECK"] as const).map((m) => (
                  <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 2.5 }}>
                    <Dot color={METHOD_COLORS[m]} size={4.5} />
                    <Text style={{ fontSize: 6.3, color: C.muted }}>{t[`method${m}`]}</Text>
                  </View>
                ))}
              </View>
            </View>
          ),
        },
      ]
    : [
        { label: t.lots, value: String(all.length) },
        { label: t.blocs, value: String(data.byBloc.length) },
        { label: t.kpiExpected, value: money(ctx, whole.charge), unit, accent: C.primary, flex: 2 },
      ];

  const doc: ListDoc<LotItem> = {
    items,
    continued: (g) => ({ ...g, key: `${g.key}+`, more: true }),
    columns: (compact, font) =>
      billed
        ? compact
          ? [
              { label: t.colLot, width: lotWidth(font, 60) },
              { label: t.ownersLabel, flex: 1 },
              { label: t.colCharge, width: 50, align: "right" },
              { label: t.colRemaining, width: 50, align: "right" },
              { label: t.colStatus, width: 38, align: "center" },
            ]
          : [
              { label: t.colLot, width: lotWidth(font, 78) },
              { label: t.ownersLabel, flex: 2 },
              { label: t.colPhone, width: 76 },
              { label: t.colCharge, width: 54, align: "right" },
              { label: t.colPaid, width: 54, align: "right" },
              { label: t.colRemaining, width: 54, align: "right" },
              { label: t.colStatus, width: 42, align: "center" },
              { label: "", width: 22, align: "center" },
            ]
        : compact
          ? [
              { label: t.colLot, width: lotWidth(font, 64) },
              { label: t.ownersLabel, flex: 1 },
              { label: t.colCharge, width: 56, align: "right" },
            ]
          : [
              { label: t.colLot, width: lotWidth(font, 90) },
              { label: t.ownersLabel, flex: 2 },
              { label: t.colPhone, width: 110 },
              { label: t.colCharge, width: 74, align: "right" },
            ],
    line: (item, compact, font) => {
      const span = compact ? 2 : 3;
      if (item.kind === "row") {
        const l = item.lot;
        const owed = l.chargeMillimes - l.paidMillimes;
        const left = (
          <Text key="owed" style={{ fontSize: font, fontWeight: 700, color: owed > 0 ? C.neg : C.ink }}>
            {money(ctx, owed)}
          </Text>
        );
        const status = l.status ? (
          <StatusPill key="s" status={l.status} label={t[`status${l.status}`]} size={font * 0.8} />
        ) : (
          ""
        );
        const lot = (
          <Text key="lot" style={{ fontSize: font, fontWeight: 700 }}>
            {l.code}
          </Text>
        );
        const owners = l.owners || "—";
        const cells = billed
          ? compact
            ? [lot, owners, money(ctx, l.chargeMillimes), left, status]
            : [
                lot,
                owners,
                l.phones,
                money(ctx, l.chargeMillimes),
                money(ctx, l.paidMillimes),
                left,
                status,
                <MethodDots key="m" methods={l.methods} size={font * 0.6} />,
              ]
          : compact
            ? [lot, owners, money(ctx, l.chargeMillimes)]
            : [lot, owners, l.phones, money(ctx, l.chargeMillimes)];
        return { kind: "row", key: item.key, cells };
      }
      const money3 = billed
        ? compact
          ? [money(ctx, item.charge), money(ctx, item.charge - item.paid)]
          : [money(ctx, item.charge), money(ctx, item.paid), money(ctx, item.charge - item.paid)]
        : [money(ctx, item.charge)];
      const rate = billed ? [`${percent(item.paid, item.charge)} %`] : [];
      const tail = billed && !compact ? [""] : [];
      return item.kind === "group"
        ? {
            kind: "group",
            key: item.key,
            label: item.more ? interpolate(t.continued, { name: item.name }) : item.name,
            detail: countText(t, ctx.locale, "lotsCount", item.count),
            span,
            cells: [...money3, ...rate, ...tail],
          }
        : {
            kind: "total",
            key: item.key,
            label: t.grandTotal,
            detail: countText(t, ctx.locale, "lotsCount", item.count),
            span,
            cells: [...money3, ...rate, ...tail],
          };
    },
  };
  return <ListPages ctx={ctx} title={title} figures={figures} doc={doc} empty={t.noLotsYet} />;
}

/* ---------- Payments ---------- */

type PaymentItem =
  | { kind: "group"; key: string; month: string; count: number; total: number; more?: boolean }
  | { kind: "row"; key: string; payment: PrintPayment }
  | { kind: "total"; key: string; count: number; total: number };

/** The cycle's payments on one page, month by month (oldest first), each month's subtotal, the total. */
export function PaymentsPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t, locale } = ctx;
  const payments = data.payments;
  const months = new Map<string, PrintPayment[]>();
  for (const p of payments) {
    const key = p.date.toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p]);
  }
  const total = payments.reduce((n, p) => n + p.amountMillimes, 0);
  const items: PaymentItem[] = payments.length
    ? [
        ...[...months.entries()].flatMap(([month, list]): PaymentItem[] => [
          { kind: "group", key: month, month, count: list.length, total: list.reduce((n, p) => n + p.amountMillimes, 0) },
          ...list.map((payment): PaymentItem => ({ kind: "row", key: payment.id, payment })),
        ]),
        { kind: "total", key: "total", count: payments.length, total },
      ]
    : [];
  const figures: Figure[] = [
    { label: t.kpiCollected, value: money(ctx, total), unit: unitOf(ctx), accent: C.olive },
    {
      label: t.payments,
      value: String(payments.length),
      sub: countText(t, ctx.locale, "monthsCount", months.size),
    },
    methodsFigure(ctx, data, 2),
  ];

  const doc: ListDoc<PaymentItem> = {
    items,
    continued: (g) => ({ ...g, key: `${g.key}+`, more: true }),
    columns: (compact, font) =>
      compact
        ? [
            { label: t.colDate, width: dateWidth(font) },
            { label: t.colLots, flex: 1 },
            { label: t.colPayer, flex: 1.1 },
            { label: "", width: 10, align: "center" },
            { label: t.total, width: 54, align: "right" },
          ]
        : [
            { label: t.colDate, width: dateWidth(font) },
            { label: t.colLots, flex: 1.2 },
            { label: t.colPayer, flex: 1.3 },
            { label: t.colMethod, width: 62 },
            { label: t.colNote, flex: 1.2 },
            { label: t.total, width: 62, align: "right" },
          ],
    line: (item, compact, font) => {
      if (item.kind === "row") {
        const p = item.payment;
        const lots = (
          <Text key="lots" style={{ fontSize: font, fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" }}>
            {p.lots}
          </Text>
        );
        const method = compact ? (
          <Dot key="m" color={METHOD_COLORS[p.method]} size={font * 0.6} />
        ) : (
          <View key="m" style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Dot color={METHOD_COLORS[p.method]} size={font * 0.55} />
            <Text style={{ fontSize: font }}>{t[`method${p.method}`]}</Text>
          </View>
        );
        return {
          kind: "row",
          key: item.key,
          cells: compact
            ? [formatDate(p.date), lots, p.payer, method, money(ctx, p.amountMillimes)]
            : [formatDate(p.date), lots, p.payer, method, p.note, money(ctx, p.amountMillimes)],
        };
      }
      const span = compact ? 4 : 5;
      return item.kind === "group"
        ? {
            kind: "group",
            key: item.key,
            label: item.more
              ? interpolate(t.continued, { name: formatMonth(item.month, locale) })
              : formatMonth(item.month, locale),
            detail: countText(t, ctx.locale, "paymentsCount", item.count),
            span,
            cells: [money(ctx, item.total)],
          }
        : {
            kind: "total",
            key: item.key,
            label: t.total,
            detail: countText(t, ctx.locale, "paymentsCount", item.count),
            span,
            cells: [money(ctx, item.total)],
          };
    },
  };
  return <ListPages ctx={ctx} title={title} figures={figures} doc={doc} empty={t.noPaymentsText} />;
}

/* ---------- Expenses ---------- */

type ExpenseItem =
  | { kind: "group"; key: string; month: string; count: number; total: number; more?: boolean }
  | { kind: "row"; key: string; expense: Expense }
  | { kind: "total"; key: string; count: number; total: number };

/** The cycle's expenses on one page, month by month, each month's subtotal, the total. */
export function ExpensesPages({ ctx, data, title }: { ctx: PdfCtx; data: PrintData; title: string }) {
  const { t, locale } = ctx;
  const months = data.expenseMonths;
  const list = months.flatMap((m) => m.items);
  const total = months.reduce((n, m) => n + m.totalMillimes, 0);
  const largest = list.reduce<Expense | null>((top, e) => (!top || e.amountMillimes > top.amountMillimes ? e : top), null);
  const items: ExpenseItem[] = list.length
    ? [
        ...months.flatMap((mo): ExpenseItem[] => [
          { kind: "group", key: mo.month, month: mo.month, count: mo.items.length, total: mo.totalMillimes },
          ...mo.items.map((expense): ExpenseItem => ({ kind: "row", key: expense.id, expense })),
        ]),
        { kind: "total", key: "total", count: list.length, total },
      ]
    : [];
  const unit = unitOf(ctx);
  const figures: Figure[] = [
    { label: t.docExpenses, value: money(ctx, total), unit, accent: C.ochreLight },
    { label: t.expenses, value: String(list.length), sub: countText(t, ctx.locale, "monthsCount", months.length) },
    { label: t.avgPerMonth, value: money(ctx, months.length ? Math.round(total / months.length) : 0), unit },
    {
      label: t.largestExpense,
      value: largest ? money(ctx, largest.amountMillimes) : "—",
      unit: largest ? unit : undefined,
      sub: largest?.label,
      flex: 1.3,
    },
  ];

  const doc: ListDoc<ExpenseItem> = {
    items,
    continued: (g) => ({ ...g, key: `${g.key}+`, more: true }),
    columns: (compact, font) =>
      compact
        ? [
            { label: t.colDate, width: dateWidth(font) },
            { label: t.colLabel, flex: 1 },
            { label: t.total, width: 56, align: "right" },
          ]
        : [
            { label: t.colDate, width: dateWidth(font) },
            { label: t.colLabel, flex: 2.6 },
            { label: t.colReference, flex: 1.1 },
            { label: t.total, width: 68, align: "right" },
          ],
    line: (item, compact, font) => {
      if (item.kind === "row") {
        const e = item.expense;
        const label = (
          <Text key="label" style={{ fontSize: font, fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" }}>
            {e.label}
            {compact && e.reference && (
              <Text style={{ fontWeight: 400, color: C.muted }}>
                {"  "}
                {e.reference}
              </Text>
            )}
          </Text>
        );
        return {
          kind: "row",
          key: item.key,
          cells: compact
            ? [formatDate(e.date), label, money(ctx, e.amountMillimes)]
            : [formatDate(e.date), label, e.reference ?? "", money(ctx, e.amountMillimes)],
        };
      }
      const span = compact ? 2 : 3;
      return item.kind === "group"
        ? {
            kind: "group",
            key: item.key,
            label: item.more
              ? interpolate(t.continued, { name: formatMonth(item.month, locale) })
              : formatMonth(item.month, locale),
            detail: countText(t, ctx.locale, "expensesCount", item.count),
            span,
            cells: [money(ctx, item.total)],
          }
        : {
            kind: "total",
            key: item.key,
            label: t.total,
            detail: countText(t, ctx.locale, "expensesCount", item.count),
            span,
            cells: [money(ctx, item.total)],
          };
    },
  };
  return <ListPages ctx={ctx} title={title} figures={figures} doc={doc} empty={t.noExpensesYet} />;
}

/** A draft cycle has nothing to list yet: one page that says so. */
export function DraftPage({ ctx, title }: { ctx: PdfCtx; title: string }) {
  return (
    <Page size="A4" style={S.page}>
      <SheetHeader ctx={ctx} title={title} />
      <View style={[S.card, { marginTop: 8, backgroundColor: C.surface2 }]}>
        <Text style={S.cardTitle}>{interpolate(ctx.t.draftTitle, { name: ctx.cycle.name })}</Text>
        <Text style={{ fontSize: 8.5, color: C.ink2, marginTop: 4 }}>{ctx.t.draftPrintText}</Text>
      </View>
    </Page>
  );
}
