import { loadWorkspace } from "@/lib/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate, formatMoney, formatAmount } from "@/lib/format";
import { outstandingLots } from "@/lib/lot-rows";
import { getLotRows, totalsFromLotRows } from "@/lib/domain/overview/service";
import * as payments from "@/lib/domain/payments/service";
import { EmptyState, Kpi, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { PaymentButton } from "@/components/workspace/PaymentModal";

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

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={t.paymentsSubtitle}
        title={t.payments}
        actions={
          cycle.status === "OPEN" &&
          can("payments:create") && (
            <PaymentButton residenceId={residenceId} lots={outstandingLots(rows)} />
          )
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
          <div className="data-head grid-cols-[120px_1fr_130px_1fr_150px]">
            <span>{t.colDate}</span>
            <span>{t.colLots}</span>
            <span>{t.colMethod}</span>
            <span>{t.colNote}</span>
            <span className="text-right">{interpolate(t.colAmount, { cur: currencySymbol(currency) })}</span>
          </div>
          {list.map((p) => (
            <div key={p.id} className="data-row grid-cols-[120px_1fr_130px_1fr_150px]">
              <span className="text-muted">{formatDate(p.date)}</span>
              <span className="font-semibold">
                {p.allocations
                  .filter((a) => a.cycleId === cycle.id)
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
            </div>
          ))}
        </div>
      )}
    </>
  );
}
