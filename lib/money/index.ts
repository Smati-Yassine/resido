/**
 * Central money abstraction. All monetary values in Résido are integer
 * millimes (1 TND = 1000 millimes). This module is the ONLY place allowed
 * to perform arithmetic on money values — see docs/04-financial-model.md
 * and docs/decisions/ADR-004-money-representation.md.
 *
 * Millimes values here stay far below Number.MAX_SAFE_INTEGER for any
 * realistic condo-finance figure, so a branded `number` is used rather than
 * `bigint` (see ADR-004 for the rationale).
 */

export type Millimes = number & { readonly __brand: "Millimes" };

const MILLIMES_PER_UNIT = 1000;

export class MoneyError extends Error {}

function assertSafeInteger(value: number, context: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`${context}: expected an integer, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${context}: value exceeds safe integer range`);
  }
}

/** Wrap a raw integer millimes value, validating it is a safe integer. */
export function millimes(value: number): Millimes {
  assertSafeInteger(value, "millimes()");
  return value as Millimes;
}

export const ZERO: Millimes = millimes(0);

export function add(a: Millimes, b: Millimes): Millimes {
  return millimes(a + b);
}

export function subtract(a: Millimes, b: Millimes): Millimes {
  return millimes(a - b);
}

export function sum(values: readonly Millimes[]): Millimes {
  return values.reduce((acc, v) => add(acc, v), ZERO);
}

export function negate(a: Millimes): Millimes {
  return millimes(-a);
}

export function isZero(a: Millimes): boolean {
  return a === 0;
}

export function isPositive(a: Millimes): boolean {
  return a > 0;
}

export function isNegative(a: Millimes): boolean {
  return a < 0;
}

export function equals(a: Millimes, b: Millimes): boolean {
  return a === b;
}

export function compare(a: Millimes, b: Millimes): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function max(a: Millimes, b: Millimes): Millimes {
  return a >= b ? a : b;
}

export function min(a: Millimes, b: Millimes): Millimes {
  return a <= b ? a : b;
}

/**
 * Multiply an amount by a ratio expressed as integers (numerator/denominator)
 * without ever going through floating point. Used for proration
 * (days-active / total-days) and similar exact-ratio calculations.
 * Uses round-half-up on the resulting millimes value.
 */
export function multiplyByRatio(amount: Millimes, numerator: number, denominator: number): Millimes {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new MoneyError("multiplyByRatio: numerator/denominator must be integers");
  }
  if (denominator === 0) {
    throw new MoneyError("multiplyByRatio: denominator cannot be zero");
  }
  const scaled = amount * numerator;
  const rounded = Math.round(scaled / denominator);
  return millimes(rounded);
}

/**
 * Parse a decimal-string TND amount (e.g. "518.880" or "518.88" or "518")
 * into integer millimes. This is the only sanctioned way to turn user input
 * into a Millimes value — never `Math.round(parseFloat(input) * 1000)`.
 */
export function fromDecimalString(input: string): Millimes {
  const trimmed = input.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match) {
    throw new MoneyError(`fromDecimalString: invalid amount "${input}"`);
  }
  const [, sign, whole, fraction = ""] = match;
  const paddedFraction = fraction.padEnd(3, "0");
  const wholeMillimes = BigInt(whole) * BigInt(MILLIMES_PER_UNIT);
  const fractionMillimes = BigInt(paddedFraction);
  let total = wholeMillimes + fractionMillimes;
  if (sign === "-") total = -total;
  const asNumber = Number(total);
  assertSafeInteger(asNumber, "fromDecimalString");
  return millimes(asNumber);
}

/** Format integer millimes as a fixed 3-decimal TND string, e.g. "518.880". */
export function toDecimalString(value: Millimes): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / MILLIMES_PER_UNIT);
  const fraction = abs % MILLIMES_PER_UNIT;
  const sign = negative ? "-" : "";
  return `${sign}${whole}.${fraction.toString().padStart(3, "0")}`;
}

/** Format for display with thousands separators, e.g. "1,335.520". */
export function format(value: Millimes, locale = "fr-TN"): string {
  const decimal = toDecimalString(value);
  const [whole, fraction] = decimal.replace("-", "").split(".");
  const groupedWhole = new Intl.NumberFormat(locale).format(BigInt(whole));
  const sign = value < 0 ? "-" : "";
  return `${sign}${groupedWhole}.${fraction}`;
}
