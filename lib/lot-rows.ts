import type { LotRow } from "@/lib/domain/overview/service";
import type { OutstandingLot } from "@/components/workspace/PaymentModal";

/**
 * Every unit of the cycle with what it still owes, for the payment form. Paid
 * units are included (owing 0): the form hides them when recording, but an
 * edited payment may cover them.
 */
export function paymentLots(rows: LotRow[]): OutstandingLot[] {
  return rows.map((r) => ({
    assessmentId: r.assessmentId,
    code: r.code,
    bloc: r.blocName,
    owners: r.owners,
    ownerName: r.ownerName,
    remainingMillimes: r.dueMillimes - r.paidMillimes,
    partlyPaid: r.status === "PARTIAL",
  }));
}
