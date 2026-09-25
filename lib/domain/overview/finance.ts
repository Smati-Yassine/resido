import type { Payment, PaymentMethod } from "@/lib/domain/payments/schema";
import type { Expense } from "@/lib/domain/expenses/schema";

/** The part of a payment that belongs to one cycle (a payment may span cycles). */
export function incomeInCycle(payment: Payment, cycleId: string): number {
  return payment.allocations.reduce((sum, a) => (a.cycleId === cycleId ? sum + a.amountMillimes : sum), 0);
}

export interface MonthFlow {
  /** "YYYY-MM" */
  month: string;
  incomeMillimes: number;
  expenseMillimes: number;
  /** Treasury balance at the end of the month. */
  balanceMillimes: number;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Money in and out of the cycle month by month, oldest first, with the
 * running balance from `openingMillimes`. Months without movements between
 * the first and the last are kept, so the chart's time axis stays even.
 */
export function monthlyFlows(
  payments: Payment[],
  expenses: Expense[],
  cycleId: string,
  openingMillimes: number,
): MonthFlow[] {
  const income = new Map<string, number>();
  const spent = new Map<string, number>();
  const add = (map: Map<string, number>, date: Date, amount: number) => {
    const month = date.toISOString().slice(0, 7);
    map.set(month, (map.get(month) ?? 0) + amount);
  };
  for (const p of payments) add(income, p.date, incomeInCycle(p, cycleId));
  for (const e of expenses) add(spent, e.date, e.amountMillimes);

  const months = [...income.keys(), ...spent.keys()].sort();
  if (months.length === 0) return [];
  const flows: MonthFlow[] = [];
  let balance = openingMillimes;
  for (let month = months[0]; month <= months[months.length - 1]; month = nextMonth(month)) {
    const incomeMillimes = income.get(month) ?? 0;
    const expenseMillimes = spent.get(month) ?? 0;
    balance += incomeMillimes - expenseMillimes;
    flows.push({ month, incomeMillimes, expenseMillimes, balanceMillimes: balance });
  }
  return flows;
}

export interface MethodShare {
  method: PaymentMethod;
  totalMillimes: number;
  count: number;
}

/** How the cycle's income was paid, largest share first. */
export function incomeByMethod(payments: Payment[], cycleId: string): MethodShare[] {
  const byMethod = new Map<PaymentMethod, MethodShare>();
  for (const p of payments) {
    const share = byMethod.get(p.method) ?? { method: p.method, totalMillimes: 0, count: 0 };
    share.totalMillimes += incomeInCycle(p, cycleId);
    share.count += 1;
    byMethod.set(p.method, share);
  }
  return [...byMethod.values()].sort((a, b) => b.totalMillimes - a.totalMillimes);
}

export interface CurvePoint {
  date: Date;
  /** Collected in the cycle up to and including this date. */
  cumulativeMillimes: number;
}

/**
 * The cycle's collection over time: the running total of what was paid, one
 * point per payment day, from `start` (at 0) to `end` (the last total).
 */
export function collectionCurve(payments: Payment[], cycleId: string, start: Date, end: Date): CurvePoint[] {
  const byDay = new Map<number, number>();
  for (const p of payments) {
    const day = Date.UTC(p.date.getUTCFullYear(), p.date.getUTCMonth(), p.date.getUTCDate());
    byDay.set(day, (byDay.get(day) ?? 0) + incomeInCycle(p, cycleId));
  }
  const points: CurvePoint[] = [{ date: start, cumulativeMillimes: 0 }];
  let total = 0;
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    total += byDay.get(day)!;
    points.push({ date: new Date(day), cumulativeMillimes: total });
  }
  const last = points[points.length - 1].date;
  points.push({ date: end.getTime() > last.getTime() ? end : last, cumulativeMillimes: total });
  return points;
}

export interface Debtor {
  /** One owner, or co-owners owing together; empty for lots without an owner. */
  ownerIds: string[];
  ownerName: string | null;
  outstandingMillimes: number;
  lotCodes: string[];
}

/** Who owes the most in the cycle, by owner — co-owners together, lots without one grouped — largest first. */
export function topDebtors(
  rows: { ownerIds: string[]; ownerName: string | null; code: string; dueMillimes: number; paidMillimes: number }[],
  limit: number,
): Debtor[] {
  const byOwner = new Map<string, Debtor>();
  for (const row of rows) {
    const owed = row.dueMillimes - row.paidMillimes;
    if (owed <= 0) continue;
    const key = [...row.ownerIds].sort().join(",");
    const debtor = byOwner.get(key) ?? {
      ownerIds: row.ownerIds,
      ownerName: row.ownerName,
      outstandingMillimes: 0,
      lotCodes: [],
    };
    debtor.outstandingMillimes += owed;
    debtor.lotCodes.push(row.code);
    byOwner.set(key, debtor);
  }
  return [...byOwner.values()].sort((a, b) => b.outstandingMillimes - a.outstandingMillimes).slice(0, limit);
}

/** Change from `previous` to `current` in whole percent; null without a base to compare to. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** What the cycle had collected by `cutoff` (everything when null) — to compare cycles at the same point. */
export function collectedBy(payments: Payment[], cycleId: string, cutoff: Date | null): number {
  return payments
    .filter((p) => !cutoff || p.date.getTime() <= cutoff.getTime())
    .reduce((sum, p) => sum + incomeInCycle(p, cycleId), 0);
}

/** What the cycle had spent by `cutoff` (everything when null). */
export function spentBy(expenses: Expense[], cutoff: Date | null): number {
  return expenses
    .filter((e) => !cutoff || e.date.getTime() <= cutoff.getTime())
    .reduce((sum, e) => sum + e.amountMillimes, 0);
}
