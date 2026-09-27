import { Page, Text, View } from "@react-pdf/renderer";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMonthShort, percent } from "@/lib/format";
import type { PrintData } from "@/lib/print/load";
import { Bar, Donut, FlowsChart, Gauge, Rings, Waterfall } from "./charts";
import { amount, Mark, money, type PdfCtx, Swatch } from "./parts";
import { METHOD_COLORS } from "./sheets";
import { C, S } from "./theme";

/** A4 portrait, less the page's side margins. */
const WIDTH = 595.28 - 64;
const GAP = 10;

/** The night band across the top of a cover: brand, residence, cycle — and a figure on the right. */
function Hero({
  ctx,
  overline,
  height,
  right,
}: {
  ctx: PdfCtx;
  overline: string;
  height: number;
  right: React.ReactNode;
}) {
  const { t, cycle } = ctx;
  const statusDot = cycle.status === "OPEN" ? C.nightPos : cycle.status === "CLOSED" ? C.stone : C.ochreLight;
  return (
    <View
      style={{
        height,
        backgroundColor: C.night,
        paddingHorizontal: 32,
        paddingTop: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", left: -90, bottom: -120 }}>
        <Rings size={300} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Mark size={20} inverse />
          <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 12, color: C.onNight }}>Résido</Text>
        </View>
        <Text style={{ fontSize: 7, color: C.nightMuted }}>{interpolate(t.printedOn, { date: ctx.printedOn })}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <View style={{ flex: 1, paddingRight: 20 }}>
          <Text style={{ fontSize: 7.5, fontWeight: 800, color: C.nightPos, letterSpacing: 1.6 }}>
            {overline.toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: "Fraunces",
              fontWeight: 700,
              fontSize: 28,
              color: C.onNight,
              marginTop: 6,
              lineHeight: 1.1,
            }}
          >
            {ctx.residence.name}
          </Text>
          <Text style={{ fontSize: 9, color: C.nightInk, marginTop: 4 }}>{ctx.residence.city}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 3.5,
                borderRadius: 10,
                borderWidth: 0.8,
                borderColor: C.nightLine,
                backgroundColor: C.nightRaised,
              }}
            >
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusDot }} />
              <Text style={{ fontSize: 8, fontWeight: 700, color: C.onNight }}>
                {cycle.name} · {t[`status${cycle.status}`]}
              </Text>
            </View>
            <Text style={{ fontSize: 7.5, color: C.nightMuted }}>{cycle.range}</Text>
          </View>
        </View>
        {right}
      </View>
    </View>
  );
}

/** One figure on a card below the band, with its change against the cycle before. */
function Kpi({
  label,
  value,
  unit,
  accent,
  delta,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
  delta: React.ReactNode;
}) {
  return (
    <View style={[S.card, { flex: 1, paddingVertical: 10, paddingHorizontal: 11 }]}>
      <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: accent, marginBottom: 7 }} />
      <Text style={{ fontSize: 6.5, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 14.5, marginTop: 3 }}>
        {value}
        <Text style={{ fontFamily: "Manrope", fontSize: 7, color: C.muted }}> {unit}</Text>
      </Text>
      <View style={{ marginTop: 4 }}>{delta}</View>
    </View>
  );
}

function CardHead({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
      <View>
        <Text style={S.cardTitle}>{title}</Text>
        {hint && <Text style={{ fontSize: 6.8, color: C.muted }}>{hint}</Text>}
      </View>
      {right}
    </View>
  );
}

function treasurySteps(ctx: PdfCtx, data: PrintData, closed: boolean) {
  const { t } = ctx;
  const tr = data.treasury;
  const afterIn = tr.openingBalanceMillimes + tr.incomeMillimes;
  return [
    {
      label: t.startBalance,
      value: money(ctx, tr.openingBalanceMillimes),
      from: 0,
      to: tr.openingBalanceMillimes,
      color: C.primary,
    },
    {
      label: t.plusIncome,
      value: `+${money(ctx, tr.incomeMillimes)}`,
      from: tr.openingBalanceMillimes,
      to: afterIn,
      color: C.olive,
    },
    {
      label: t.minusExpenses,
      value: `−${money(ctx, tr.expenseMillimes)}`,
      from: afterIn,
      to: afterIn - tr.expenseMillimes,
      color: C.ochreLight,
    },
    {
      label: closed ? t.closingBalance : t.currentBalance,
      value: money(ctx, tr.closingBalanceMillimes),
      from: 0,
      to: tr.closingBalanceMillimes,
      color: tr.closingBalanceMillimes < 0 ? C.neg : C.night,
    },
  ];
}

function FlowsCard({ ctx, data, height }: { ctx: PdfCtx; data: PrintData; height: number }) {
  const { t, locale } = ctx;
  const months = data.flows.slice(-12).map((f) => ({
    label: formatMonthShort(f.month, locale),
    income: f.incomeMillimes,
    expense: f.expenseMillimes,
    balance: f.balanceMillimes,
  }));
  return (
    <View style={S.card}>
      <CardHead
        title={t.coverFlows}
        right={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Swatch color={C.olive} label={t.coverIn} />
            <Swatch color={C.ochreLight} label={t.coverOut} />
            <Swatch color={C.primary} label={t.coverBalance} />
          </View>
        }
      />
      {months.length === 0 ? (
        <Text style={[S.muted, { paddingVertical: 20, textAlign: "center" }]}>{t.coverNoFlows}</Text>
      ) : (
        <FlowsChart months={months} width={WIDTH - 25.5} height={height} />
      )}
    </View>
  );
}

/** A card title and, under it, one plain sentence saying what the card shows. */
function Explained({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={S.cardTitle}>{title}</Text>
      <Text style={{ fontSize: 7.5, color: C.muted }}>{text}</Text>
    </View>
  );
}

/**
 * The residence report's first page, kept simple: the collection rate, the
 * four figures of the cycle (each with what it means), the treasury as four
 * lines, and each bloc's collection as a small table.
 */
export function ReportCover({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t } = ctx;
  const { totals, treasury } = data;
  const closed = ctx.cycle.status === "CLOSED";
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const unit = amount(ctx, 0).split("\u00a0").pop()!;
  const blocs = data.blocProgress;
  const cols = [
    { label: t.colBloc, flex: 1.6, align: "left" as const },
    { label: t.colLots, flex: 0.6, align: "right" as const },
    { label: t.kpiExpected, flex: 1.3, align: "right" as const },
    { label: t.kpiCollected, flex: 1.3, align: "right" as const },
    { label: t.kpiOutstanding, flex: 1.3, align: "right" as const },
    { label: t.kpiRate, flex: 1.6, align: "right" as const },
  ];
  const cell = (i: number, content: React.ReactNode, bold = false) => (
    <View
      key={i}
      style={{
        flex: cols[i].flex,
        paddingHorizontal: 4,
        alignItems: cols[i].align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {typeof content === "string" ? (
        <Text style={{ fontWeight: bold ? 800 : 400, textAlign: cols[i].align }}>{content}</Text>
      ) : (
        content
      )}
    </View>
  );
  const treasuryLines: [string, string, string, boolean][] = [
    [t.startBalance, t.coverStartText, money(ctx, treasury.openingBalanceMillimes), false],
    [t.plusIncome, t.coverInText, `+ ${money(ctx, treasury.incomeMillimes)}`, false],
    [t.minusExpenses, t.coverOutText, `− ${money(ctx, treasury.expenseMillimes)}`, false],
    [
      closed ? t.closingBalance : t.currentBalance,
      t.coverBalanceText,
      money(ctx, treasury.closingBalanceMillimes),
      true,
    ],
  ];

  return (
    <Page size="A4" wrap={false} style={[S.page, { paddingTop: 0, paddingHorizontal: 0 }]}>
      <Hero
        ctx={ctx}
        overline={t.docReport}
        height={200}
        right={
          <Gauge
            value={rate}
            size={116}
            label={t.kpiRate}
            caption={interpolate(t.coverLotsPaid, { paid: totals.paid, total: totals.lotCount })}
          />
        }
      />

      <View style={{ paddingHorizontal: 32, marginTop: -30, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi
            label={t.kpiExpected}
            value={money(ctx, totals.expectedMillimes)}
            unit={unit}
            accent={C.primary}
            delta={
              <Text style={{ fontSize: 6.8, color: C.muted }}>
                {interpolate(t.coverExpectedText, { count: totals.lotCount })}
              </Text>
            }
          />
          <Kpi
            label={t.kpiCollected}
            value={money(ctx, totals.collectedMillimes)}
            unit={unit}
            accent={C.olive}
            delta={<Text style={{ fontSize: 6.8, color: C.muted }}>{t.coverCollectedText}</Text>}
          />
          <Kpi
            label={t.kpiOutstanding}
            value={money(ctx, totals.outstandingMillimes)}
            unit={unit}
            accent={C.ochre}
            delta={<Text style={{ fontSize: 6.8, color: C.muted }}>{t.coverOutstandingText}</Text>}
          />
          <Kpi
            label={t.kpiBalance}
            value={money(ctx, treasury.closingBalanceMillimes)}
            unit={unit}
            accent={C.night}
            delta={<Text style={{ fontSize: 6.8, color: C.muted }}>{t.coverBalanceText}</Text>}
          />
        </View>

        <View style={S.card}>
          <Explained title={t.treasurySummary} text={t.coverTreasuryText} />
          {treasuryLines.map(([label, text, value, total]) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                borderTopWidth: total ? 1 : 0.5,
                borderTopColor: total ? C.ink : C.lineSoft,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: total ? 800 : 600, fontSize: total ? 9.5 : 8.5 }}>{label}</Text>
                <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{text}</Text>
              </View>
              <Text style={{ fontWeight: total ? 800 : 600, fontSize: total ? 11 : 9 }}>
                {value} <Text style={{ fontSize: 7, color: C.muted, fontWeight: 400 }}>{unit}</Text>
              </Text>
            </View>
          ))}
        </View>

        <View style={S.card}>
          <Explained title={t.coverBlocs} text={t.coverBlocsText} />
          <View style={{ flexDirection: "row", paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: C.ink }}>
            {cols.map((c, i) =>
              cell(
                i,
                <Text style={{ fontSize: 6.5, fontWeight: 700, color: C.muted, textAlign: c.align }}>
                  {c.label.toUpperCase()}
                </Text>,
              ),
            )}
          </View>
          {blocs.map((b) => {
            const pct = percent(b.collectedMillimes, b.expectedMillimes);
            return (
              <View
                key={b.name}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 5,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.lineSoft,
                }}
              >
                {cell(0, b.name, true)}
                {cell(1, String(b.lotCount))}
                {cell(2, money(ctx, b.expectedMillimes))}
                {cell(3, money(ctx, b.collectedMillimes))}
                {cell(4, money(ctx, b.expectedMillimes - b.collectedMillimes))}
                {cell(
                  5,
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, width: "100%" }}>
                    <View style={{ flex: 1 }}>
                      <Bar value={pct} color={pct >= 100 ? C.olive : C.primary} />
                    </View>
                    <Text style={{ fontWeight: 800, width: 32, textAlign: "right" }}>{`${pct}\u00a0%`}</Text>
                  </View>,
                )}
              </View>
            );
          })}
          <View style={{ flexDirection: "row", paddingTop: 6 }}>
            {cell(0, t.total, true)}
            {cell(1, String(totals.lotCount), true)}
            {cell(2, money(ctx, totals.expectedMillimes), true)}
            {cell(3, money(ctx, totals.collectedMillimes), true)}
            {cell(4, money(ctx, totals.outstandingMillimes), true)}
            {cell(5, `${rate} %`, true)}
          </View>
        </View>
      </View>
    </Page>
  );
}

/**
 * The financial report's first page: the treasury in the band, where it came
 * from and went, month by month, how it was paid and the largest expenses.
 */
export function FinanceCover({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t } = ctx;
  const { treasury, before, totals } = data;
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const closed = ctx.cycle.status === "CLOSED";
  const vs = before
    ? interpolate(data.toDate ? t.vsPreviousToDate : t.vsPrevious, { name: before.name })
    : t.coverFirstCycle;
  const unit = amount(ctx, 0).split(" ").pop()!;
  const methodTotal = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  const expenses = data.expenseMonths
    .flatMap((m) => m.items)
    .sort((a, b) => b.amountMillimes - a.amountMillimes)
    .slice(0, 5);
  const maxExpense = Math.max(1, ...expenses.map((e) => e.amountMillimes));
  const half = (WIDTH - GAP) / 2;

  return (
    <Page size="A4" wrap={false} style={[S.page, { paddingTop: 0, paddingHorizontal: 0 }]}>
      <Hero
        ctx={ctx}
        overline={t.docFinances}
        height={184}
        right={
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 7.5, color: C.nightInk, letterSpacing: 0.4 }}>
              {(closed ? t.closingBalance : t.currentBalance).toUpperCase()}
            </Text>
            <Text
              style={{
                fontFamily: "Fraunces",
                fontWeight: 700,
                fontSize: 26,
                marginTop: 4,
                color: treasury.closingBalanceMillimes < 0 ? C.ochreLight : C.onNight,
              }}
            >
              {money(ctx, treasury.closingBalanceMillimes)}
              <Text style={{ fontSize: 11, color: C.nightMuted }}> {unit}</Text>
            </Text>
            <Text style={{ fontSize: 7.5, color: C.nightMuted, marginTop: 5 }}>
              <Text style={{ color: C.nightPos, fontWeight: 700 }}>+{money(ctx, treasury.incomeMillimes)}</Text>
              {"   "}
              <Text style={{ color: C.ochreLight, fontWeight: 700 }}>−{money(ctx, treasury.expenseMillimes)}</Text>
            </Text>
          </View>
        }
      />

      <View style={{ paddingHorizontal: 32, marginTop: -30, gap: GAP }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi
            label={t.startBalance}
            value={money(ctx, treasury.openingBalanceMillimes)}
            unit={unit}
            accent={C.primary}
            delta={
              <Text style={{ fontSize: 6.5, color: C.muted }}>
                {treasury.carriedFrom
                  ? interpolate(t.carriedFrom, { name: treasury.carriedFrom.name })
                  : t.coverFirstCycle}
              </Text>
            }
          />
          <Kpi
            label={t.plusIncome}
            value={money(ctx, treasury.incomeMillimes)}
            unit={unit}
            accent={C.olive}
            delta={
              <Text style={{ fontSize: 6.5, color: C.muted }}>
                {interpolate(t.paymentsCount, { count: data.payments.length })}
              </Text>
            }
          />
          <Kpi
            label={t.minusExpenses}
            value={money(ctx, treasury.expenseMillimes)}
            unit={unit}
            accent={C.ochre}
            delta={
              <Text style={{ fontSize: 6.5, color: C.muted }}>
                {interpolate(t.expensesCount, { count: data.expenseMonths.reduce((n, m) => n + m.items.length, 0) })}
              </Text>
            }
          />
          <Kpi
            label={t.kpiRate}
            value={`${rate}`}
            unit="%"
            accent={C.night}
            delta={
              before ? (
                <Text style={{ fontSize: 6.5, color: C.muted }}>
                  <Text style={{ fontWeight: 800, color: rate >= before.rate ? C.pos : C.neg }}>
                    {rate >= before.rate ? "↑" : "↓"} {Math.abs(rate - before.rate)} pts
                  </Text>{" "}
                  {vs}
                </Text>
              ) : (
                <Text style={{ fontSize: 6.5, color: C.muted }}>{vs}</Text>
              )
            }
          />
        </View>

        <View style={S.card}>
          <CardHead title={t.treasurySummary} hint={t.coverWaterfall} />
          <Waterfall steps={treasurySteps(ctx, data, closed)} width={WIDTH - 25.5} height={78} />
        </View>

        <FlowsCard ctx={ctx} data={data} height={92} />

        <View style={{ flexDirection: "row", gap: GAP }}>
          <View style={[S.card, { width: half }]}>
            <CardHead title={t.byMethod} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Donut
                parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))}
                size={78}
                center={String(data.payments.length)}
                centerLabel={t.payments}
              />
              <View style={{ flex: 1, gap: 6 }}>
                {data.methods.map((m) => (
                  <View key={m.method} style={{ gap: 1.5 }}>
                    <Swatch
                      color={METHOD_COLORS[m.method]}
                      label={t[`method${m.method}`]}
                      value={`${percent(m.totalMillimes, methodTotal)} %`}
                    />
                    <Text style={{ fontSize: 6.5, color: C.muted, marginLeft: 12 }}>
                      {money(ctx, m.totalMillimes)} · {m.count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={[S.card, { width: half }]}>
            <CardHead title={t.docExpenses} />
            {expenses.length === 0 ? (
              <Text style={[S.muted, { paddingVertical: 14 }]}>{t.noExpensesYet}</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {expenses.map((e) => (
                  <View key={e.id} style={{ gap: 2.5 }}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Text style={{ fontWeight: 700, flex: 1, maxLines: 1, textOverflow: "ellipsis" }}>{e.label}</Text>
                      <Text style={{ fontWeight: 800 }}>{money(ctx, e.amountMillimes)}</Text>
                    </View>
                    <Bar value={(e.amountMillimes / maxExpense) * 100} color={C.ochreLight} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    </Page>
  );
}
