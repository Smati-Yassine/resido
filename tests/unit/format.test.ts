import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatMoney, toInputAmount } from "@/lib/format";
import { fitsCurrency } from "@/lib/currency";

describe("format: money by currency", () => {
  it("shows the currency's decimals and symbol", () => {
    expect(formatMoney(27297999)).toBe("27 297.999");
    expect(formatMoney(1209760, "EUR")).toBe("1 209.76");
    expect(formatAmount(1209760, "EUR")).toBe("1 209.76 €");
    expect(formatAmount(-5000, "TND")).toBe("−5.000 DT");
    expect(formatAmount(1000000000, "USD")).toBe("1 000 000.00 $");
  });

  it("never silently rounds a value more precise than the currency", () => {
    expect(formatMoney(12345, "EUR")).toBe("12.345");
  });

  it("gives plain input values", () => {
    expect(toInputAmount(1209760, "TND")).toBe("1209.760");
    expect(toInputAmount(1209760, "EUR")).toBe("1209.76");
  });

  it("knows which amounts a currency can hold", () => {
    expect(fitsCurrency(12345, "TND")).toBe(true);
    expect(fitsCurrency(12345, "EUR")).toBe(false);
    expect(fitsCurrency(12340, "EUR")).toBe(true);
  });
});

describe("format: dates", () => {
  it("shows DD/MM/YYYY, read in UTC", () => {
    expect(formatDate(new Date("2026-09-04T00:00:00Z"))).toBe("04/09/2026");
  });
});
