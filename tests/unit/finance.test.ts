import { describe, expect, it } from "vitest";
import {
  collectedBy,
  collectionCurve,
  incomeByMethod,
  monthlyFlows,
  percentChange,
  spentBy,
  topDebtors,
} from "@/lib/domain/overview/finance";
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

describe("dashboard figures", () => {
  it("builds the collection curve day by day, from 0 at the start to the end", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    const curve = collectionCurve(
      [
        payment("2026-03-02T10:00:00Z", "CASH", ["c", 100]),
        payment("2026-01-15", "CASH", ["c", 50], ["x", 999]),
        payment("2026-03-02T15:00:00Z", "CHECK", ["c", 25]),
      ],
      "c",
      start,
      end,
    );
    expect(curve.map((p) => [p.date.toISOString().slice(0, 10), p.cumulativeMillimes])).toEqual([
      ["2026-01-01", 0],
      ["2026-01-15", 50],
      ["2026-03-02", 175],
      ["2026-12-31", 175],
    ]);
  });

  it("ranks who owes the most, lots without an owner grouped", () => {
    const row = (code: string, ownerId: string | null, due: number, paid: number) => ({
      code,
      ownerId,
      ownerName: ownerId && ownerId.toUpperCase(),
      dueMillimes: due,
      paidMillimes: paid,
    });
    expect(
      topDebtors([row("A1", "a", 100, 0), row("A2", "b", 100, 100), row("A3", "a", 50, 10), row("B1", null, 70, 0)], 5),
    ).toEqual([
      { ownerId: "a", ownerName: "A", outstandingMillimes: 140, lotCodes: ["A1", "A3"] },
      { ownerId: null, ownerName: null, outstandingMillimes: 70, lotCodes: ["B1"] },
    ]);
  });

  it("compares with the previous cycle only when there is one", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(-50, -100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
  });

  it("sums what was collected and spent by a date, to compare cycles at the same point", () => {
    const pays = [payment("2025-02-01", "CASH", ["p", 10]), payment("2025-06-01", "CASH", ["p", 20], ["q", 5])];
    expect(collectedBy(pays, "p", new Date("2025-03-01"))).toBe(10);
    expect(collectedBy(pays, "p", null)).toBe(30);
    expect(spentBy([expense("2025-01-10", 4), expense("2025-08-01", 6)], new Date("2025-03-01"))).toBe(4);
  });
});
