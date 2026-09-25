import { loadWorkspace } from "@/lib/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate, formatMoney, formatAmount } from "@/lib/format";
import { paymentLots } from "@/lib/lot-rows";
import { getLotRows, totalsFromLotRows } from "@/lib/domain/overview/service";
import * as payments from "@/lib/domain/payments/service";
import { EmptyState, Kpi, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { PaymentButton } from "@/components/workspace/PaymentModal";
import { PaymentRowActions } from "@/components/workspace/PaymentRowActions";

export default async function PaymentsPage({ params, searchParams }: PageProps<"/residences/[residenceId]/payments">) {
  const { session, residenceId, cycle, currency, can, base } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;
  if (cycle.status === "DRAFT") return <DraftCycle base={base} cycle={cycle} t={t} />;

  const [rows, paymentList] = await Promise.all([
    getLotRows(session, residenceId, cycle.id),
    payments.listPaymentsForCycle(session, residenceId, cycle.id),
  ]);
  const totals = totalsFromLotRows(rows);
  const codeOf = new Map(rows.map((r) => [r.assessmentId, r]));
  const list = paymentList.ok ? paymentList.data : [];
  const lots = paymentLots(rows);
  // Payments can change only while the cycle is open, and only for roles that may undo them.
  const canChange = cycle.status === "OPEN" && can("payments:cancel");
  const grid = canChange ? "grid-cols-[120px_1fr_130px_1fr_150px_84px]" : "grid-cols-[120px_1fr_130px_1fr_150px]";

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={t.paymentsSubtitle}
        title={t.payments}
        actions={
          cycle.status === "OPEN" && can("payments:create") && <PaymentButton residenceId={residenceId} lots={lots} />
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi
          label={t.kpiCollected}
          value={formatAmount(totals.collectedMillimes, currency)}
          valueClassName="text-pos text-[26px]"
        />
        <Kpi
          label={t.kpiOutstanding}
          value={formatAmount(totals.outstandingMillimes, currency)}
          valueClassName="text-neg text-[26px]"
        />
        <Kpi label={t.lotsPartialOrUnpaid} value={totals.partial + totals.unpaid} valueClassName="text-[26px]" />
      </div>

      {list.length === 0 ? (
        <EmptyState text={t.noPaymentsText} />
      ) : (
        <div className="card data-table">
          <div className={`data-head ${grid}`}>
            <span>{t.colDate}</span>
            <span>{t.colLots}</span>
            <span>{t.colMethod}</span>
            <span>{t.colNote}</span>
            <span className="text-right">{interpolate(t.colAmount, { cur: currencySymbol(currency) })}</span>
            {canChange && <span />}
          </div>
          {list.map((p) => {
            const allocations = p.allocations.filter((a) => a.cycleId === cycle.id);
            return (
              <div key={p.id} className={`data-row ${grid}`}>
                <span className="text-muted">{formatDate(p.date)}</span>
                <span className="font-semibold">
                  {allocations
                    .map((a) => {
                      const row = codeOf.get(a.assessmentId);
                      const partial = row && a.amountMillimes < row.dueMillimes;
                      return `${row?.code ?? "?"}${partial ? ` (${t.partialTag})` : ""}`;
                    })
                    .join(", ")}
                  {p.payerName && <span className="block text-xs font-medium text-muted">{p.payerName}</span>}
                </span>
                <span>
                  <span className="badge badge-closed">{t[`method${p.method}`]}</span>
                </span>
                <span className="text-[13px] text-muted">{p.note ?? "—"}</span>
                <span className="num text-right font-bold">{formatMoney(p.amountMillimes, currency)}</span>
                {canChange && (
                  <PaymentRowActions
                    residenceId={residenceId}
                    lots={lots}
                    lotCodes={allocations.map((a) => codeOf.get(a.assessmentId)?.code ?? "?").join(", ")}
                    amountMillimes={p.amountMillimes}
                    payment={{
                      id: p.id,
                      date: p.date.toISOString().slice(0, 10),
                      method: p.method,
                      note: p.note,
                      allocations: allocations.map((a) => ({
                        assessmentId: a.assessmentId,
                        amountMillimes: a.amountMillimes,
                      })),
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
