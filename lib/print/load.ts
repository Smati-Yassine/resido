import type { Cycle } from "@/lib/domain/cycles/schema";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import * as payments from "@/lib/domain/payments/service";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { getExpenseMonths, totalsFromLotRows } from "@/lib/domain/overview/service";
import { incomeInCycle } from "@/lib/domain/overview/finance";
import { loadProperty } from "@/lib/property/load";
import { lotRowsFor } from "@/lib/workspace";

/** One lot line of the property sheet — the residence's ledger, by bloc. */
export interface PrintLot {
  code: string;
  owners: string;
  phones: string;
  chargeMillimes: number;
  paidMillimes: number;
  status: "PAID" | "PARTIAL" | "UNPAID" | null;
  methods: PaymentMethod[];
}

export interface PrintPayment {
  id: string;
  date: Date;
  lots: string;
  payer: string;
  method: PaymentMethod;
  note: string;
  /** The part of the payment that belongs to this cycle. */
  amountMillimes: number;
}

/**
 * Everything the printed documents show, for the cycle on screen: the lots by
 * bloc with owners, phones and how they paid; the payments; the expenses by
 * month; the treasury; the headline figures.
 */
export async function loadPrintData(session: AuthorizedSession, residenceId: string, cycle: Cycle) {
  const billed = cycle.status !== "DRAFT";
  const [property, rows, paymentResult, months, treasuries] = await Promise.all([
    loadProperty(session, residenceId, cycle),
    billed ? lotRowsFor(session, residenceId, cycle.id) : Promise.resolve([]),
    billed ? payments.listPaymentsForCycle(session, residenceId, cycle.id) : Promise.resolve(null),
    billed ? getExpenseMonths(session, residenceId, cycle.id) : Promise.resolve([]),
    computeAllTreasuries(residenceId),
  ]);
  const paymentList = paymentResult?.ok ? paymentResult.data : [];

  const phoneOf = new Map(property.ownerItems.map((o) => [o.id, o.phone]));
  const methodsOf = new Map<string, Set<PaymentMethod>>();
  for (const p of paymentList) {
    for (const a of p.allocations.filter((x) => x.cycleId === cycle.id)) {
      const set = methodsOf.get(a.lotId) ?? new Set<PaymentMethod>();
      set.add(p.method);
      methodsOf.set(a.lotId, set);
    }
  }
  const byBloc = property.blocs
    .map((b) => ({
      name: b.name,
      lots: property.lotItems
        .filter((l) => l.blocId === b.id)
        .map((l): PrintLot => ({
          code: l.code,
          owners: l.ownerName ?? "",
          phones: l.edit.ownerIds
            .map((id) => phoneOf.get(id))
            .filter(Boolean)
            .join(" · "),
          chargeMillimes: l.chargeMillimes,
          paidMillimes: l.paidMillimes ?? 0,
          status: l.status,
          methods: [...(methodsOf.get(l.id) ?? [])],
        })),
    }))
    .filter((b) => b.lots.length > 0);

  const codeOf = new Map(rows.map((r) => [r.assessmentId, r]));
  const paymentRows: PrintPayment[] = paymentList
    .map((p) => {
      const mine = p.allocations.filter((a) => a.cycleId === cycle.id);
      return {
        id: p.id,
        date: p.date,
        lots: mine
          .map((a) => {
            const row = codeOf.get(a.assessmentId);
            return row ? row.code : "?";
          })
          .join(", "),
        payer: p.payerName ?? "",
        method: p.method,
        note: p.note ?? "",
        amountMillimes: incomeInCycle(p, cycle.id),
      };
    })
    // Oldest first, like a ledger.
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    byBloc,
    payments: paymentRows,
    expenseMonths: months,
    treasury: treasuries.get(cycle.id)!,
    totals: totalsFromLotRows(rows),
    property,
  };
}

export type PrintData = Awaited<ReturnType<typeof loadPrintData>>;
