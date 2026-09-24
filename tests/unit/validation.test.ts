import { describe, expect, it } from "vitest";
import {
  millimesInputSchema,
  nonNegativeMillimesInputSchema,
  cycleDateRangeSchema,
  objectIdSchema,
} from "@/lib/validation/primitives";
import { toDecimalString } from "@/lib/money";

describe("validation: millimesInputSchema", () => {
  it("parses a valid decimal-string amount into Millimes", () => {
    const result = millimesInputSchema.safeParse("518.880");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(toDecimalString(result.data)).toBe("518.880");
    }
  });

  it("rejects a malformed amount", () => {
    const result = millimesInputSchema.safeParse("not-a-number");
    expect(result.success).toBe(false);
  });

  it("nonNegativeMillimesInputSchema rejects a negative amount", () => {
    const result = nonNegativeMillimesInputSchema.safeParse("-5.000");
    expect(result.success).toBe(false);
  });
});

describe("validation: cycleDateRangeSchema", () => {
  it("accepts an arbitrary, non-calendar-aligned range", () => {
    const result = cycleDateRangeSchema.safeParse({
      startDate: "2025-07-01",
      endDate: "2026-09-30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = cycleDateRangeSchema.safeParse({
      startDate: "2026-01-01",
      endDate: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("validation: objectIdSchema", () => {
  it("accepts a valid 24-char hex id", () => {
    expect(objectIdSchema.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
  });

  it("rejects an invalid id", () => {
    expect(objectIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
