import { Page, Text, View } from "@react-pdf/renderer";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMonthShort, percent } from "@/lib/format";
import { percentChange } from "@/lib/domain/overview/finance";
import type { PrintData } from "@/lib/print/load";
import { Bar, Donut, FlowsChart, Gauge, Rings, StackedBar, Waterfall } from "./charts";
import { amount, Delta, Footer, Mark, money, type PdfCtx, Swatch } from "./parts";
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

/**
 * The residence report's first page: the cycle in one look — collection
 * gauge, the four figures against the cycle before, the treasury from
 * opening to balance, the lots by status, money in and out by month,
 * collection by bloc and who owes the most.
 */
export function ReportCover({ ctx, data }: { ctx: PdfCtx; data: PrintData }) {
  const { t } = ctx;
  const { totals, treasury, before } = data;
  const closed = ctx.cycle.status === "CLOSED";
  const rate = percent(totals.collectedMillimes, totals.expectedMillimes);
  const vs = before
    ? interpolate(data.toDate ? t.vsPreviousToDate : t.vsPrevious, { name: before.name })
    : t.coverFirstCycle;
  const unit = amount(ctx, 0).split(" ").pop()!;
  const change = (now: number, then: number | undefined) => (before ? percentChange(now, then) : null);
  const statusParts = [
    { key: "paid", value: totals.paid, color: C.olive, label: t.paidPlural },
    { key: "partial", value: totals.partial, color: C.partial, label: t.partialPlural },
    { key: "unpaid", value: totals.unpaid, color: C.stone, label: t.unpaidPlural },
  ];
  const methodTotal = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  const blocs = data.blocProgress.slice(0, 6);
  const maxDebt = Math.max(1, ...data.debtors.map((d) => d.outstandingMillimes));
  const half = (WIDTH - GAP) / 2;

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

      <View style={{ paddingHorizontal: 32, marginTop: -30, gap: GAP }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi
            label={t.kpiExpected}
            value={money(ctx, totals.expectedMillimes)}
            unit={unit}
            accent={C.primary}
            delta={<Delta change={change(totals.expectedMillimes, before?.expectedMillimes)} vs={vs} goodWhenUp />}
          />
          <Kpi
            label={t.kpiCollected}
            value={money(ctx, totals.collectedMillimes)}
            unit={unit}
            accent={C.olive}
            delta={<Delta change={change(totals.collectedMillimes, before?.collectedMillimes)} vs={vs} goodWhenUp />}
          />
          <Kpi
            label={t.kpiOutstanding}
            value={money(ctx, totals.outstandingMillimes)}
            unit={unit}
            accent={C.ochre}
            delta={
              <Delta
                change={change(totals.outstandingMillimes, before?.outstandingMillimes)}
                vs={vs}
                goodWhenUp={false}
              />
            }
          />
          <Kpi
            label={t.kpiBalance}
            value={money(ctx, treasury.closingBalanceMillimes)}
            unit={unit}
            accent={C.night}
            delta={
              <Delta change={change(treasury.closingBalanceMillimes, before?.balanceMillimes)} vs={vs} goodWhenUp />
            }
          />
        </View>

        <View style={{ flexDirection: "row", gap: GAP }}>
          <View style={[S.card, { flex: 1.4 }]}>
            <CardHead title={t.treasurySummary} hint={t.coverWaterfall} />
            <Waterfall
              steps={treasurySteps(ctx, data, closed)}
              width={(WIDTH - GAP) * (1.4 / 2.4) - 25.5}
              height={70}
            />
          </View>
          <View style={[S.card, { flex: 1 }]}>
            <CardHead title={t.coverStatus} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Donut parts={statusParts} size={74} center={String(totals.lotCount)} centerLabel={t.lots} />
              <View style={{ flex: 1, gap: 5 }}>
                {statusParts.map((p) => (
                  <Swatch
                    key={p.key}
                    color={p.color}
                    label={p.label}
                    value={`${p.value} · ${percent(p.value, totals.lotCount)} %`}
                  />
                ))}
              </View>
            </View>
            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.line, gap: 5 }}>
              <Text style={{ fontSize: 6.5, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>
                {t.byMethod.toUpperCase()}
              </Text>
              <StackedBar
                height={5}
                parts={data.methods.map((m) => ({ value: m.totalMillimes, color: METHOD_COLORS[m.method] }))}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 2 }}>
                {data.methods.map((m) => (
                  <Swatch
                    key={m.method}
                    color={METHOD_COLORS[m.method]}
                    label={`${t[`method${m.method}`]} ${percent(m.totalMillimes, methodTotal)} %`}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        <FlowsCard ctx={ctx} data={data} height={76} />

        <View style={{ flexDirection: "row", gap: GAP }}>
          <View style={[S.card, { width: half }]}>
            <CardHead title={t.coverBlocs} />
            <View style={{ gap: 6 }}>
              {blocs.map((b) => {
                const pct = percent(b.collectedMillimes, b.expectedMillimes);
                return (
                  <View key={b.name} style={{ gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                      <Text style={{ fontWeight: 800, flex: 1 }}>{b.name}</Text>
                      <Text style={{ fontSize: 6.8, color: C.muted }}>
                        {money(ctx, b.collectedMillimes)} / {money(ctx, b.expectedMillimes)}
                      </Text>
                      <Text style={{ fontWeight: 800, width: 26, textAlign: "right" }}>{pct} %</Text>
                    </View>
                    <Bar value={pct} color={pct >= 100 ? C.olive : pct >= 50 ? C.primary : C.ochreLight} />
                  </View>
                );
              })}
              {data.blocProgress.length > blocs.length && (
                <Text style={{ fontSize: 6.8, color: C.muted }}>+{data.blocProgress.length - blocs.length}</Text>
              )}
            </View>
          </View>
          <View style={[S.card, { width: half }]}>
            <CardHead title={t.topDebtors} />
            {data.debtors.length === 0 ? (
              <Text style={[S.muted, { paddingVertical: 14 }]}>{t.coverNoDebt}</Text>
            ) : (
              <View style={{ gap: 5 }}>
                {data.debtors.map((d, i) => (
                  <View
                    key={d.ownerIds.join(",") || "none"}
                    style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
                  >
                    <View
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: 8,
                        backgroundColor: i === 0 ? C.ochre : C.ground,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 7, fontWeight: 800, color: i === 0 ? C.white : C.ink2 }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2.5 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Text style={{ fontWeight: 700, flex: 1, maxLines: 1, textOverflow: "ellipsis" }}>
                          {d.ownerName ?? t.noOwnerLabel}
                        </Text>
                        <Text style={{ fontWeight: 800, color: C.neg }}>{money(ctx, d.outstandingMillimes)}</Text>
                      </View>
                      <Bar value={(d.outstandingMillimes / maxDebt) * 100} color={C.ochreLight} />
                      <Text style={{ fontSize: 6.3, color: C.muted, maxLines: 1, textOverflow: "ellipsis" }}>
                        {d.lotCodes.join(", ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
      <Footer ctx={ctx} />
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
      <Footer ctx={ctx} />
    </Page>
  );
}
