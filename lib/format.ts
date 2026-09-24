import type { Locale } from "@/lib/i18n/dictionaries";
import { millimes, toDecimalString } from "@/lib/money";
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currency";

/**
 * Display formatting shared by server and client components. Money is shown
 * as "27 297.999" (TND) or "27 297.99" (EUR): a space between thousands
 * (kept on one line by the .num class) and the currency's decimals. A value
 * with more precision than the currency shows (typed before a currency
 * change) keeps all three decimals rather than being silently rounded.
 */
export function formatMoney(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const decimal = toDecimalString(millimes(value));
  const negative = decimal.startsWith("-");
  const [whole, fraction] = decimal.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimals = CURRENCIES[currency].decimals;
  const shown = /^0*$/.test(fraction.slice(decimals)) ? fraction.slice(0, decimals) : fraction;
  return `${negative ? "−" : ""}${grouped}${shown ? `.${shown}` : ""}`;
}

/** An amount with its currency symbol: "1 209.760 DT", "1 209.76 €". */
export function formatAmount(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return `${formatMoney(value, currency)} ${CURRENCIES[currency].symbol}`;
}

/** The plain decimal an amount input starts with: "1209.760" (TND), "1209.76" (EUR). */
export function toInputAmount(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return formatMoney(value, currency).replace(/ /g, "").replace("−", "-");
}

/** Dates are stored as UTC midnights, so they are always read in UTC. */
export function formatDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

/** Date and time, e.g. for the activity log. */
export function formatDateTime(date: Date, locale: Locale): string {
  const time = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Tunis",
  }).format(date);
  return `${formatDate(date)} ${time}`;
}

/** "2026-01" → "Janvier 2026" / "January 2026". */
export function formatMonth(month: string, locale: Locale): string {
  const label = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Today as "YYYY-MM-DD", the value format of <input type="date">. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Up to two initials, for avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
