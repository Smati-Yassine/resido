import type { Cycle } from "@/lib/domain/cycles/schema";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import * as payments from "@/lib/domain/payments/service";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { getExpenseMonths, progressByBloc, totalsFromLotRows } from "@/lib/domain/overview/service";
import {
  collectedBy,
  incomeByMethod,
  incomeInCycle,
  monthlyFlows,
  spentBy,
  topDebtors,
} from "@/lib/domain/overview/finance";
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

/** The previous cycle's figures at the same point — as the dashboard compares them. */
export interface PrintBefore {
  name: string;
  expectedMillimes: number;
  collectedMillimes: number;
  outstandingMillimes: number;
  balanceMillimes: number;
  rate: number;
}

/**
 * Everything the printed documents show, for the cycle on screen: the lots by
 * bloc with owners, phones and how they paid; the payments; the expenses by
 * month; the treasury; the headline figures and, for the covers, the charts'
 * series and the previous cycle to compare with.
 */
export async function loadPrintData(
  session: AuthorizedSession,
  residenceId: string,
  cycle: Cycle,
  previous: Cycle | null,
) {
  const billed = cycle.status !== "DRAFT";
  const before = billed && previous && previous.status !== "DRAFT" ? previous : null;
  const [property, rows, paymentResult, months, treasuries, previousRows, previousPayments, previousMonths] =
    await Promise.all([
      loadProperty(session, residenceId, cycle),
      billed ? lotRowsFor(session, residenceId, cycle.id) : Promise.resolve([]),
      billed ? payments.listPaymentsForCycle(session, residenceId, cycle.id) : Promise.resolve(null),
      billed ? getExpenseMonths(session, residenceId, cycle.id) : Promise.resolve([]),
      computeAllTreasuries(residenceId),
      before ? lotRowsFor(session, residenceId, before.id) : Promise.resolve(null),
      before ? payments.listPaymentsForCycle(session, residenceId, before.id) : Promise.resolve(null),
      before ? getExpenseMonths(session, residenceId, before.id) : Promise.resolve(null),
    ]);
  const paymentList = paymentResult?.ok ? paymentResult.data : [];
  const treasury = treasuries.get(cycle.id)!;

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

  // While a cycle runs, the previous one is cut as far into it as this one has gone.
  const now = new Date();
  const end = cycle.endDate ?? now;
  const elapsed = Math.min(now.getTime(), end.getTime()) - cycle.startDate.getTime();
  const cutoff = before && cycle.status === "OPEN" ? new Date(before.startDate.getTime() + elapsed) : null;
  const beforeTreasury = before ? treasuries.get(before.id) : undefined;
  let comparison: PrintBefore | null = null;
  if (before && previousRows && previousPayments?.ok && beforeTreasury) {
    const expected = totalsFromLotRows(previousRows).expectedMillimes;
    const collected = collectedBy(previousPayments.data, before.id, cutoff);
    const spent = spentBy(previousMonths?.flatMap((m) => m.items) ?? [], cutoff);
    comparison = {
      name: before.name,
      expectedMillimes: expected,
      collectedMillimes: collected,
      outstandingMillimes: expected - collected,
      balanceMillimes: beforeTreasury.openingBalanceMillimes + collected - spent,
      rate: expected ? Math.round((collected / expected) * 100) : 0,
    };
  }

  return {
    byBloc,
    payments: paymentRows,
    expenseMonths: months,
    treasury,
    totals: totalsFromLotRows(rows),
    property,
    flows: monthlyFlows(
      paymentList,
      months.flatMap((m) => m.items),
      cycle.id,
      treasury.openingBalanceMillimes,
    ),
    methods: incomeByMethod(paymentList, cycle.id),
    blocProgress: progressByBloc(rows),
    debtors: topDebtors(rows, 5),
    before: comparison,
    toDate: !!cutoff,
  };
}

export type PrintData = Awaited<ReturnType<typeof loadPrintData>>;
