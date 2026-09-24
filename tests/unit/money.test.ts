import { describe, expect, it } from "vitest";
import {
  add,
  subtract,
  sum,
  millimes,
  fromDecimalString,
  toDecimalString,
  multiplyByRatio,
  MoneyError,
  compare,
  format,
} from "@/lib/money";

describe("money: fromDecimalString / toDecimalString", () => {
  it("parses a 3-decimal TND string into integer millimes", () => {
    expect(fromDecimalString("518.880")).toBe(518880);
    expect(fromDecimalString("1335.520")).toBe(1335520);
  });

  it("round-trips exactly", () => {
    const cases = ["518.880", "1.000", "0.001", "1209.760", "6382.399"];
    for (const c of cases) {
      expect(toDecimalString(fromDecimalString(c))).toBe(c);
    }
  });

  it("pads short fractional parts", () => {
    expect(fromDecimalString("518.88")).toBe(518880);
    expect(fromDecimalString("518")).toBe(518000);
    expect(fromDecimalString("518.5")).toBe(518500);
  });

  it("rejects invalid input instead of silently coercing", () => {
    expect(() => fromDecimalString("abc")).toThrow(MoneyError);
    expect(() => fromDecimalString("518.8800")).toThrow(MoneyError);
    expect(() => fromDecimalString("")).toThrow(MoneyError);
  });

  it("never produces the 0.1 + 0.2 floating point drift", () => {
    // The classic float bug: 0.1 + 0.2 !== 0.3 in IEEE 754.
    // Millimes arithmetic is integer addition and is always exact.
    const a = fromDecimalString("0.100");
    const b = fromDecimalString("0.200");
    expect(add(a, b)).toBe(fromDecimalString("0.300"));
  });
});

describe("money: arithmetic", () => {
  it("add/subtract are exact integer operations", () => {
    const a = millimes(1000);
    const b = millimes(250);
    expect(add(a, b)).toBe(1250);
    expect(subtract(a, b)).toBe(750);
  });

  it("sum reduces a list of millimes exactly (6-lot payment, matching the Excel receipt #21 total)", () => {
    // docs/01-excel-analysis.md: one owner's receipt #21 covers 6 lots
    // (A21, A22, A31, A32, A41, A42) totalling 11,631.920 TND.
    const allocations = [
      fromDecimalString("2000.000"),
      fromDecimalString("2000.000"),
      fromDecimalString("2000.000"),
      fromDecimalString("2000.000"),
      fromDecimalString("2000.000"),
      fromDecimalString("1631.920"),
    ];
    expect(sum(allocations)).toBe(fromDecimalString("11631.920"));
  });

  it("compare orders millimes values correctly", () => {
    expect(compare(millimes(100), millimes(200))).toBe(-1);
    expect(compare(millimes(200), millimes(100))).toBe(1);
    expect(compare(millimes(100), millimes(100))).toBe(0);
  });
});

describe("money: multiplyByRatio", () => {
  it("computes an exact proration ratio", () => {
    const fullCycleAmount = fromDecimalString("1200.000");
    // 15 days active out of 30-day cycle -> half
    expect(multiplyByRatio(fullCycleAmount, 15, 30)).toBe(fromDecimalString("600.000"));
  });

  it("rejects a zero denominator", () => {
    expect(() => multiplyByRatio(millimes(1000), 1, 0)).toThrow(MoneyError);
  });
});

describe("money: format", () => {
  it("adds thousands separators while preserving 3-decimal precision", () => {
    expect(format(fromDecimalString("1335.520"), "en-US")).toBe("1,335.520");
  });
});
