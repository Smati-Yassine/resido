import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatDate, formatMoney } from "@/lib/format";
import type { LotRow } from "@/lib/domain/overview/service";
import type { Payment } from "@/lib/domain/payments/schema";
import type { OutstandingLot } from "@/components/workspace/PaymentModal";
import { EmptyState } from "@/components/ui/Display";
import { PaymentRowActions } from "@/components/workspace/PaymentRowActions";

/** The Finances "payments" tab: every payment of the cycle, newest first. */
export function PaymentsTable({
  t,
  currency,
  residenceId,
  cycleId,
  payments,
  rows,
  lots,
  canChange,
}: {
  t: Dictionary;
  currency: CurrencyCode;
  residenceId: string;
  cycleId: string;
  payments: Payment[];
  rows: LotRow[];
  lots: OutstandingLot[];
  /** Payments change only while the cycle is open, and only for roles that may undo them. */
  canChange: boolean;
}) {
  if (payments.length === 0) return <EmptyState text={t.noPaymentsText} />;
  const byAssessment = new Map(rows.map((r) => [r.assessmentId, r]));
  const grid = canChange
    ? "grid-cols-[110px_minmax(0,1fr)_130px_minmax(0,1fr)_150px_84px]"
    : "grid-cols-[110px_minmax(0,1fr)_130px_minmax(0,1fr)_150px]";

  return (
    <div className="card data-table">
      <div className={`data-head ${grid}`}>
        <span>{t.colDate}</span>
        <span>{t.colLots}</span>
        <span>{t.colMethod}</span>
        <span>{t.colNote}</span>
        <span className="text-right">{interpolate(t.colAmount, { cur: currencySymbol(currency) })}</span>
        {canChange && <span />}
      </div>
      {payments.map((p) => {
        const allocations = p.allocations.filter((a) => a.cycleId === cycleId);
        return (
          <div key={p.id} className={`data-row ${grid}`}>
            <span className="text-muted">{formatDate(p.date)}</span>
            <span className="font-semibold">
              {allocations
                .map((a) => {
                  const row = byAssessment.get(a.assessmentId);
                  const partial = row && a.amountMillimes < row.dueMillimes;
                  return `${row?.code ?? "?"}${partial ? ` (${t.partialTag})` : ""}`;
                })
                .join(", ")}
              {p.payerName && <span className="block truncate text-xs font-medium text-muted">{p.payerName}</span>}
            </span>
            <span>
              <span className="badge badge-closed">{t[`method${p.method}`]}</span>
            </span>
            <span className="text-[13px] text-muted" title={p.note ?? undefined}>
              {p.note ?? "—"}
            </span>
            <span className="num text-right font-bold">{formatMoney(p.amountMillimes, currency)}</span>
            {canChange && (
              <PaymentRowActions
                residenceId={residenceId}
                lots={lots}
                lotCodes={allocations.map((a) => byAssessment.get(a.assessmentId)?.code ?? "?").join(", ")}
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
  );
}
