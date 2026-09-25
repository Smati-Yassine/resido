import type { LotRow } from "@/lib/domain/overview/service";
import type { OutstandingLot } from "@/components/workspace/PaymentModal";

/** Lots that still owe something — the choices offered in the payment modal. */
export function outstandingLots(rows: LotRow[]): OutstandingLot[] {
  return rows
    .filter((r) => r.status !== "PAID")
    .map((r) => ({
      assessmentId: r.assessmentId,
      code: r.code,
      bloc: r.blocName,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      remainingMillimes: r.dueMillimes - r.paidMillimes,
      partlyPaid: r.status === "PARTIAL",
    }));
}
