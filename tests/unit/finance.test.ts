import { describe, expect, it } from "vitest";
import { incomeByMethod, monthlyFlows } from "@/lib/domain/overview/finance";
import type { Payment, PaymentMethod } from "@/lib/domain/payments/schema";
import type { Expense } from "@/lib/domain/expenses/schema";

const payment = (date: string, method: PaymentMethod, ...allocations: [cycleId: string, amount: number][]) =>
  ({
    date: new Date(date),
    method,
    amountMillimes: allocations.reduce((n, [, a]) => n + a, 0),
    allocations: allocations.map(([cycleId, amountMillimes]) => ({ cycleId, amountMillimes })),
  }) as Payment;
const expense = (date: string, amountMillimes: number) => ({ date: new Date(date), amountMillimes }) as Expense;

describe("finance overview", () => {
  it("counts only the cycle's share of each payment, month by month, with gaps kept", () => {
    const flows = monthlyFlows(
      [payment("2026-01-10", "CASH", ["c1", 100_000], ["c0", 50_000]), payment("2026-03-02", "CHECK", ["c1", 40_000])],
      [expense("2026-01-20", 30_000), expense("2026-03-15", 80_000)],
      "c1",
      10_000,
    );
    expect(flows).toEqual([
      { month: "2026-01", incomeMillimes: 100_000, expenseMillimes: 30_000, balanceMillimes: 80_000 },
      { month: "2026-02", incomeMillimes: 0, expenseMillimes: 0, balanceMillimes: 80_000 },
      { month: "2026-03", incomeMillimes: 40_000, expenseMillimes: 80_000, balanceMillimes: 40_000 },
    ]);
  });

  it("crosses the year boundary", () => {
    const flows = monthlyFlows([payment("2025-12-31", "CASH", ["c", 1])], [expense("2026-01-01", 1)], "c", 0);
    expect(flows.map((f) => f.month)).toEqual(["2025-12", "2026-01"]);
  });

  it("is empty without movements", () => {
    expect(monthlyFlows([], [], "c", 5)).toEqual([]);
  });

  it("splits income by method, largest first", () => {
    expect(
      incomeByMethod(
        [
          payment("2026-01-01", "CASH", ["c", 10]),
          payment("2026-01-02", "BANK_TRANSFER", ["c", 50]),
          payment("2026-01-03", "CASH", ["c", 15], ["x", 99]),
        ],
        "c",
      ),
    ).toEqual([
      { method: "BANK_TRANSFER", totalMillimes: 50, count: 1 },
      { method: "CASH", totalMillimes: 25, count: 2 },
    ]);
  });
});
