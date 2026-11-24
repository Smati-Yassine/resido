import { Page, Text, View } from "@react-pdf/renderer";
import { countText, interpolate } from "@/lib/i18n/dictionaries";
import { formatMonthShort, percent } from "@/lib/format";
import { percentChange } from "@/lib/domain/overview/finance";
import type { PrintData } from "@/lib/print/load";
import { Bar, Donut, FlowsChart, StackedBar, Waterfall } from "./charts";
import { amount, blocLabel, Dot, Mark, money, type PdfCtx, Swatch } from "./parts";
import { METHOD_COLORS } from "./sheets";
import { C, S } from "./theme";

/**
 * The first pages of the reports — the residence report's dashboard and the
 * financial report's cover — on one A4 page each, in one language: a
 * masthead, a headline figure, a strip of four figures against the cycle
 * before, then panels. Every block has a fixed height and fits what it holds
 * to it, so a page never runs over, whatever the residence's size.
 */

/** A4 portrait, less the page's side margins. */
const WIDTH = 595.28 - 64;
const GAP = 10;
const HALF = (WIDTH - GAP) / 2;

const unitOf = (ctx: PdfCtx) => amount(ctx, 0).split(" ").pop()!;

/** The residence, the document and the cycle, over a rule. */
function Masthead({ ctx, overline }: { ctx: PdfCtx; overline: string }) {
  const { t, cycle } = ctx;
  const statusDot = cycle.status === "OPEN" ? C.olive : cycle.status === "CLOSED" ? C.stone : C.ochreLight;
  return (
    <View
      style={{
        height: 52,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        paddingBottom: 10,
        borderBottomWidth: 1.5,
        borderBottomColor: C.ink,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
        <Mark size={28} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 19, maxLines: 1, textOverflow: "ellipsis" }}>
            {ctx.residence.name}
          </Text>
          <Text style={{ fontSize: 8, color: C.muted, maxLines: 1 }}>{ctx.residence.city}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 6.8, fontWeight: 800, color: C.primary, letterSpacing: 1.4 }}>
          {overline.toUpperCase()}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
          <Dot color={statusDot} size={5} />
          <Text style={{ fontSize: 9.5, fontWeight: 800 }}>
            {cycle.name} · {t[`status${cycle.status}`]}
          </Text>
        </View>
        <Text style={{ fontSize: 7, color: C.muted, marginTop: 1.5 }}>
          {cycle.range} · {interpolate(t.printedOn, { date: ctx.printedOn })}
        </Text>
      </View>
    </View>
  );
}

/** A small caps label. */
function Label({ children, color = C.muted }: { children: string; color?: string }) {
  return (
    <Text style={{ fontSize: 6.3, fontWeight: 700, color, letterSpacing: 0.4, maxLines: 1 }}>
      {children.toUpperCase()}
    </Text>
  );
}

/** Up or down against the cycle before, coloured by whether that is good news. */
function Change({ now, then, good }: { now: number; then: number; good: "up" | "down" | null }) {
  const change = percentChange(now, then);
  if (change === null || change === 0) return null;
  const up = change > 0;
  const color = good === null ? C.muted : (good === "up") === up ? C.pos : C.neg;
  return (
    <Text style={{ fontWeight: 800, color }}>
      {up ? "↑" : "↓"} {Math.abs(change)} %{"  "}
    </Text>
  );
}

/** The rate's change in points against the cycle before, then which cycle that is. */
function RateChange({ ctx, data, rate }: { ctx: PdfCtx; data: PrintData; rate: number }) {
  const { t } = ctx;
  const { before } = data;
  const vs = before
    ? interpolate(data.toDate ? t.vsPreviousToDate : t.vsPrevious, { name: before.name })
    : t.coverFirstCycle;
  return (
    <Text style={{ fontSize: 7.5, color: C.muted }}>
      {before && rate !== before.rate && (
        <Text style={{ fontWeight: 800, color: rate > before.rate ? C.pos : C.neg }}>
          {rate > before.rate ? "↑" : "↓"} {interpolate(t.ratePoints, { n: Math.abs(rate - before.rate) })}{" "}
        </Text>
      )}
      {vs}
    </Text>
  );
}

interface Kpi {
  label: string;
  /** A sum in millimes, or a figure already written ("79"). */
  value: number | string;
  unit: string;
  accent: string;
  /** The line under the value: a change and the cycle before, or what the figure means. */
  sub: React.ReactNode;
}

/** Four figures between two rules. */
function KpiStrip({ ctx, kpis }: { ctx: PdfCtx; kpis: Kpi[] }) {
  return (
    <View
      style={{
        height: 58,
        marginTop: 14,
        flexDirection: "row",
        borderTopWidth: 0.75,
        borderBottomWidth: 0.75,
        borderColor: C.line,
      }}
    >
      {kpis.map((k, i) => (
        <View
          key={k.label}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingLeft: i === 0 ? 0 : 10,
            paddingRight: 6,
            borderLeftWidth: i === 0 ? 0 : 0.75,
            borderLeftColor: C.line,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 2.5, borderRadius: 1, backgroundColor: k.accent }} />
            <Label>{k.label}</Label>
          </View>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 14, marginTop: 3, maxLines: 1 }}>
            {typeof k.value === "number" ? money(ctx, k.value) : k.value}
            <Text style={{ fontFamily: "Manrope", fontSize: 7, color: C.muted }}> {k.unit}</Text>
          </Text>
          <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 2, maxLines: 1, textOverflow: "ellipsis" }}>
            {k.sub}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A figure compared with the cycle before — or, in a first cycle, what it means. */
function versus(ctx: PdfCtx, data: PrintData, now: number, then: number | undefined, good: "up" | "down" | null, text: string) {
  const { before } = data;
  return before && then !== undefined ? (
    <>
      <Change now={now} then={then} good={good} />
      {interpolate(ctx.t.coverPrevious, { name: before.name, value: money(ctx, then) })}
    </>
  ) : (
    text
  );
}

/** A card of fixed height: its title (and something on the right), then what it shows. */
function Panel({
  title,
  right,
  width,
  height,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[S.card, { width, height, padding: 11, overflow: "hidden" }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 10.5 }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: "row", gap: GAP, marginTop: GAP }}>{children}</View>
);

const Empty = ({ text }: { text: string }) => (
  <Text style={[S.muted, { paddingVertical: 30, textAlign: "center" }]}>{text}</Text>
);

function treasurySteps(ctx: PdfCtx, data: PrintData, closed: boolean) {
  const { t } = ctx;
  const tr = data.treasury;
  const afterIn = tr.openingBalanceMillimes + tr.incomeMillimes;
  return [
    { label: t.startBalance, value: money(ctx, tr.openingBalanceMillimes), from: 0, to: tr.openingBalanceMillimes, color: C.primary },
    { label: t.plusIncome, value: `+${money(ctx, tr.incomeMillimes)}`, from: tr.openingBalanceMillimes, to: afterIn, color: C.olive },
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

/** The treasury from its opening to its balance, as floating bars. */
function TreasuryPanel({ ctx, data, width, height }: { ctx: PdfCtx; data: PrintData; width: number; height: number }) {
  const { t } = ctx;
  return (
    <Panel
      title={t.treasurySummary}
      right={<Text style={{ fontSize: 6.8, color: C.muted }}>{t.coverWaterfall}</Text>}
      width={width}
      height={height}
    >
      <Waterfall
        steps={treasurySteps(ctx, data, ctx.cycle.status === "CLOSED")}
        width={width - 24}
        height={height - 78}
      />
    </Panel>
  );
}

/** Money in and out by month, the balance as a line over them. */
function FlowsPanel({ ctx, data, width, height }: { ctx: PdfCtx; data: PrintData; width: number; height: number }) {
  const { t, locale } = ctx;
  const flows = data.flows.slice(-12);
  // A narrow panel names one month in two.
  const every = flows.length > 6 && width < WIDTH / 2 + 1 ? 2 : 1;
  return (
    <Panel title={t.coverMonthlyNet} width={width} height={height}>
      {flows.length === 0 ? (
        <Empty text={t.coverNoFlows} />
      ) : (
        <FlowsChart
          months={flows.map((f) => ({
            label: formatMonthShort(f.month, locale),
            income: f.incomeMillimes,
            expense: f.expenseMillimes,
            balance: f.balanceMillimes,
          }))}
          width={width - 24}
          height={height - 82}
          labelEvery={every}
        />
      )}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 7, justifyContent: "center" }}>
        <Swatch color={C.olive} label={t.coverIn} />
        <Swatch color={C.ochreLight} label={t.coverOut} />
        <Swatch color={C.primary} label={t.coverBalance} />
      </View>
    </Panel>
  );
}

/** The largest expenses, each with its share of all the cycle spent. */
function ExpensesPanel({
  ctx,
  data,
  count,
  width,
  height,
}: {
  ctx: PdfCtx;
  data: PrintData;
  count: number;
  width: number;
  height: number;
}) {
  const { t } = ctx;
  const spent = data.treasury.expenseMillimes;
  const largest = data.expenseMonths
    .flatMap((m) => m.items)
    .sort((a, b) => b.amountMillimes - a.amountMillimes)
    .slice(0, count);
  return (
    <Panel
      title={t.docExpenses}
      width={width}
      height={height}
      right={<Text style={{ fontSize: 8, fontWeight: 800, color: C.ochre }}>{money(ctx, spent)}</Text>}
    >
      {largest.length === 0 ? (
        <Text style={S.muted}>{t.noExpensesYet}</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {largest.map((e) => (
            <View key={e.id} style={{ gap: 2.5 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 7.5, fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" }}>
                  {e.label}
                </Text>
                <Text style={{ fontSize: 7.5, fontWeight: 800 }}>{money(ctx, e.amountMillimes)}</Text>
              </View>
              <Bar value={spent > 0 ? (e.amountMillimes / spent) * 100 : 0} color={C.ochreLight} />
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

/* ---------- The residence report's dashboard ---------- */

/**
 * The residence report's first page: where collection stands (the rate,
 * collected against what is left, the lots by status), the four figures
 * against the cycle before, the treasury and the months, each bloc's
 * collection, who owes the most, how owners paid and where the money went.
 */
export function ReportCover({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t, locale } = ctx;
  const { totals, treasury, before } = data;
  const closed = ctx.cycle.status === "CLOSED";
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const unit = unitOf(ctx);

  // Blocs: rows as tall as fit (18 pt at most); past 11 pt, the last ones are counted in a line.
  const BLOC_ROOM = 136;
  const blocs = data.blocProgress;
  const blocRow = Math.min(18, BLOC_ROOM / Math.max(1, blocs.length));
  const blocShown = blocRow >= 11 ? blocs.length : Math.floor(BLOC_ROOM / 11) - 1;
  const blocHeight = Math.max(11, blocRow);

  const debtors = data.debtors.slice(0, 5);
  const methodTotal = data.methods.reduce((n, m) => n + m.totalMillimes, 0);

  return (
    <Page size="A4" wrap={false} style={S.page}>
      <Masthead ctx={ctx} overline={t.docReport} />

      {/* Where collection stands */}
      <View style={{ height: 96, marginTop: 16, flexDirection: "row", gap: 22, alignItems: "center" }}>
        <View style={{ width: 168 }}>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 54, lineHeight: 1, color: C.night }}>
            {rate}
            <Text style={{ fontSize: 22 }}> %</Text>
          </Text>
          <Text style={{ fontSize: 8.5, color: C.ink2, marginTop: 3, marginBottom: 4 }}>{t.coverRateHeadline}</Text>
          <RateChange ctx={ctx} data={data} rate={rate} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
            <View>
              <Label>{t.kpiCollected}</Label>
              <Text style={{ fontSize: 11, fontWeight: 800, color: C.olive, marginTop: 1 }}>
                {money(ctx, totals.collectedMillimes)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Label>{t.kpiOutstanding}</Label>
              <Text style={{ fontSize: 11, fontWeight: 800, color: C.ochre, marginTop: 1 }}>
                {money(ctx, totals.outstandingMillimes)}
              </Text>
            </View>
          </View>
          <StackedBar
            height={12}
            parts={[
              { value: totals.collectedMillimes, color: C.olive },
              { value: Math.max(0, totals.outstandingMillimes), color: C.partialBg },
            ]}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {(
                [
                  [C.paidFg, "lotsPaidCount", totals.paid],
                  [C.partial, "lotsPartialCount", totals.partial],
                  [C.unpaidFg, "lotsUnpaidCount", totals.unpaid],
                ] as const
              ).map(([color, key, count]) => (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Dot color={color} size={5} />
                  <Text style={{ fontSize: 7, color: C.ink2 }}>{countText(t, locale, key, count)}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 7, color: C.muted }}>{countText(t, locale, "lotsCount", totals.lotCount)}</Text>
          </View>
        </View>
      </View>

      <KpiStrip
        ctx={ctx}
        kpis={[
          {
            label: t.kpiExpected,
            value: totals.expectedMillimes,
            unit,
            accent: C.primary,
            sub: versus(ctx, data, totals.expectedMillimes, before?.expectedMillimes, null,
              interpolate(t.coverExpectedText, { count: totals.lotCount })),
          },
          {
            label: t.kpiCollected,
            value: totals.collectedMillimes,
            unit,
            accent: C.olive,
            sub: versus(ctx, data, totals.collectedMillimes, before?.collectedMillimes, "up", t.coverCollectedText),
          },
          {
            label: t.kpiOutstanding,
            value: totals.outstandingMillimes,
            unit,
            accent: C.ochre,
            sub: versus(ctx, data, totals.outstandingMillimes, before?.outstandingMillimes, "down", t.coverOutstandingText),
          },
          {
            label: closed ? t.closingBalance : t.kpiBalance,
            value: treasury.closingBalanceMillimes,
            unit,
            accent: C.night,
            sub: versus(ctx, data, treasury.closingBalanceMillimes, before?.balanceMillimes, "up", t.coverBalanceText),
          },
        ]}
      />

      <View style={{ flexDirection: "row", gap: GAP, marginTop: 14 }}>
        <TreasuryPanel ctx={ctx} data={data} width={HALF} height={170} />
        <FlowsPanel ctx={ctx} data={data} width={HALF} height={170} />
      </View>

      <Row>
        <Panel title={t.coverBlocs} width={HALF} height={196}>
          <View
            style={{ flexDirection: "row", paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: C.ink, marginBottom: 1 }}
          >
            <View style={{ flex: 1.3 }}>
              <Label>{t.colBloc}</Label>
            </View>
            <View style={{ flex: 1 }}>
              <Label>{t.kpiRate}</Label>
            </View>
            <View style={{ width: 62, alignItems: "flex-end" }}>
              <Label>{t.colRemaining}</Label>
            </View>
          </View>
          {blocs.slice(0, blocShown).map((b, i) => {
            const pct = percent(b.collectedMillimes, b.expectedMillimes);
            const left = b.expectedMillimes - b.collectedMillimes;
            return (
              <View
                key={i}
                style={{
                  height: blocHeight,
                  flexDirection: "row",
                  alignItems: "center",
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.lineSoft,
                }}
              >
                <Text
                  style={{ flex: 1.3, fontSize: 7.5, fontWeight: 700, maxLines: 1, textOverflow: "ellipsis", paddingRight: 4 }}
                >
                  {blocLabel(ctx, b.name)}
                </Text>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Bar value={pct} color={pct >= 100 ? C.olive : C.primary} />
                  </View>
                  <Text style={{ width: 22, fontSize: 7, fontWeight: 800, textAlign: "right" }}>{pct}%</Text>
                </View>
                <Text
                  style={{ width: 62, fontSize: 7.5, fontWeight: 700, textAlign: "right", color: left > 0 ? C.neg : C.muted }}
                >
                  {money(ctx, left)}
                </Text>
              </View>
            );
          })}
          {blocShown < blocs.length && (
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 3 }}>
              {countText(t, locale, "coverMoreBlocs", blocs.length - blocShown)}
            </Text>
          )}
        </Panel>
        <Panel title={t.topDebtors} width={HALF} height={196}>
          {debtors.length === 0 ? (
            <Empty text={t.allPaid} />
          ) : (
            <View>
              {debtors.map((d, i) => (
                <View
                  key={i}
                  style={{
                    height: 26,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderBottomWidth: i === debtors.length - 1 ? 0 : 0.5,
                    borderBottomColor: C.lineSoft,
                  }}
                >
                  <Text style={{ width: 12, fontSize: 7, fontWeight: 800, color: C.muted }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 8, fontWeight: 700, maxLines: 1, textOverflow: "ellipsis" }}>
                      {d.ownerName ?? t.noOwnerLabel}
                    </Text>
                    <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 1, maxLines: 1, textOverflow: "ellipsis" }}>
                      {d.lotCodes.join(", ")}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 8.5, fontWeight: 800, color: C.neg }}>{money(ctx, d.outstandingMillimes)}</Text>
                </View>
              ))}
              {data.debtors.length > debtors.length && (
                <Text style={{ fontSize: 7, color: C.muted, marginTop: 4 }}>
                  {countText(t, locale, "coverMoreDebtors", data.debtors.length - debtors.length)}
                </Text>
              )}
            </View>
          )}
        </Panel>
      </Row>

      <Row>
        <Panel title={t.byMethod} width={HALF} height={118}>
          <StackedBar
            height={8}
            parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))}
          />
          <View style={{ gap: 5, marginTop: 9 }}>
            {data.methods.length === 0 ? (
              <Text style={S.muted}>{t.noPaymentsText}</Text>
            ) : (
              data.methods.map((m) => (
                <Swatch
                  key={m.method}
                  color={METHOD_COLORS[m.method]}
                  label={`${t[`method${m.method}`]} · ${m.count}`}
                  value={`${money(ctx, m.totalMillimes)}   ${percent(m.totalMillimes, methodTotal)} %`}
                />
              ))
            )}
          </View>
        </Panel>
        <ExpensesPanel ctx={ctx} data={data} count={3} width={HALF} height={118} />
      </Row>
    </Page>
  );
}

/* ---------- The financial report's cover ---------- */

/**
 * The financial report's first page, in the dashboard's language: the
 * treasury's balance and what came in and went out, the four figures against
 * the cycle before, the treasury from opening to balance, the months, how
 * owners paid and the largest expenses.
 */
export function FinanceCover({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t, locale } = ctx;
  const { treasury, totals, before } = data;
  const closed = ctx.cycle.status === "CLOSED";
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const unit = unitOf(ctx);
  const net = treasury.incomeMillimes - treasury.expenseMillimes;
  const most = Math.max(1, treasury.incomeMillimes, treasury.expenseMillimes);
  const expenseCount = data.expenseMonths.reduce((n, m) => n + m.items.length, 0);
  const methodTotal = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  const flow = (label: string, value: number, color: string, sign: string) => (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Label>{label}</Label>
        <Text style={{ fontSize: 10, fontWeight: 800, color }}>
          {sign}
          {money(ctx, value)}
        </Text>
      </View>
      <View style={{ height: 9, borderRadius: 3, backgroundColor: C.lineSoft, flexDirection: "row", overflow: "hidden" }}>
        <View style={{ width: `${(value / most) * 100}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );

  return (
    <Page size="A4" wrap={false} style={S.page}>
      <Masthead ctx={ctx} overline={t.docFinances} />

      {/* The balance, and what came in and went out */}
      <View style={{ height: 96, marginTop: 16, flexDirection: "row", gap: 22, alignItems: "center" }}>
        <View style={{ width: 200 }}>
          <Label>{closed ? t.closingBalance : t.currentBalance}</Label>
          <Text
            style={{
              fontFamily: "Fraunces",
              fontWeight: 700,
              fontSize: 34,
              lineHeight: 1.05,
              marginTop: 3,
              maxLines: 1,
              color: treasury.closingBalanceMillimes < 0 ? C.neg : C.night,
            }}
          >
            {money(ctx, treasury.closingBalanceMillimes)}
            <Text style={{ fontSize: 13, color: C.muted }}> {unit}</Text>
          </Text>
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 4, maxLines: 1, textOverflow: "ellipsis" }}>
            {before ? (
              <>
                <Change now={treasury.closingBalanceMillimes} then={before.balanceMillimes} good="up" />
                {interpolate(t.coverPrevious, { name: before.name, value: money(ctx, before.balanceMillimes) })}
              </>
            ) : treasury.carriedFrom ? (
              interpolate(t.carriedFrom, { name: treasury.carriedFrom.name })
            ) : (
              t.coverFirstCycle
            )}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 9 }}>
          {flow(t.coverIn, treasury.incomeMillimes, C.olive, "+")}
          {flow(t.coverOut, treasury.expenseMillimes, C.ochreLight, "−")}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 5 }}>
            <Text style={{ fontSize: 7, color: C.muted }}>{t.coverNet}</Text>
            <Text style={{ fontSize: 7.5, fontWeight: 800, color: net < 0 ? C.neg : C.pos }}>
              {net < 0 ? "" : "+"}
              {money(ctx, net)} {unit}
            </Text>
          </View>
        </View>
      </View>

      <KpiStrip
        ctx={ctx}
        kpis={[
          {
            label: t.startBalance,
            value: treasury.openingBalanceMillimes,
            unit,
            accent: C.primary,
            sub: treasury.carriedFrom ? interpolate(t.carriedFrom, { name: treasury.carriedFrom.name }) : t.coverStartText,
          },
          {
            label: t.plusIncome,
            value: treasury.incomeMillimes,
            unit,
            accent: C.olive,
            sub: countText(t, locale, "paymentsCount", data.payments.length),
          },
          {
            label: t.minusExpenses,
            value: treasury.expenseMillimes,
            unit,
            accent: C.ochre,
            sub: countText(t, locale, "expensesCount", expenseCount),
          },
          {
            label: t.kpiRate,
            value: String(rate),
            unit: "%",
            accent: C.night,
            sub: <RateChange ctx={ctx} data={data} rate={rate} />,
          },
        ]}
      />

      <View style={{ marginTop: 14 }}>
        <TreasuryPanel ctx={ctx} data={data} width={WIDTH} height={150} />
      </View>
      <Row>
        <FlowsPanel ctx={ctx} data={data} width={WIDTH} height={176} />
      </Row>
      <Row>
        <Panel title={t.byMethod} width={HALF} height={150}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Donut
              parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))}
              size={84}
              center={String(data.payments.length)}
              centerLabel={t.payments}
            />
            <View style={{ flex: 1, gap: 7 }}>
              {data.methods.map((m) => (
                <View key={m.method} style={{ gap: 1.5 }}>
                  <Swatch
                    color={METHOD_COLORS[m.method]}
                    label={t[`method${m.method}`]}
                    value={`${percent(m.totalMillimes, methodTotal)} %`}
                  />
                  <Text style={{ fontSize: 6.5, color: C.muted, marginLeft: 12 }}>
                    {money(ctx, m.totalMillimes)} · {countText(t, locale, "paymentsCount", m.count)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Panel>
        <ExpensesPanel ctx={ctx} data={data} count={5} width={HALF} height={150} />
      </Row>
    </Page>
  );
}
