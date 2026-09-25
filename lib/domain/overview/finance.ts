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
