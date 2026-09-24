/**
 * Currencies a residence can keep its books in. Amounts are always stored as
 * integer thousandths of the currency unit (the "millimes" of lib/money), so
 * switching currency never changes a stored number — only how it is shown
 * and how many decimals may be typed.
 */
export const CURRENCIES = {
  TND: { symbol: "DT", decimals: 3, name: { fr: "Dinar tunisien", en: "Tunisian dinar" } },
  EUR: { symbol: "€", decimals: 2, name: { fr: "Euro", en: "Euro" } },
  USD: { symbol: "$", decimals: 2, name: { fr: "Dollar américain", en: "US dollar" } },
  GBP: { symbol: "£", decimals: 2, name: { fr: "Livre sterling", en: "Pound sterling" } },
  CAD: { symbol: "$ CA", decimals: 2, name: { fr: "Dollar canadien", en: "Canadian dollar" } },
  CHF: { symbol: "CHF", decimals: 2, name: { fr: "Franc suisse", en: "Swiss franc" } },
  MAD: { symbol: "DH", decimals: 2, name: { fr: "Dirham marocain", en: "Moroccan dirham" } },
  DZD: { symbol: "DA", decimals: 2, name: { fr: "Dinar algérien", en: "Algerian dinar" } },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const DEFAULT_CURRENCY: CurrencyCode = "TND";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && value in CURRENCIES;
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES[code].symbol;
}

/**
 * True when an amount (in thousandths) needs no more decimals than the
 * currency has: 12.345 is a valid TND amount but not a valid EUR one.
 */
export function fitsCurrency(millimes: number, code: CurrencyCode): boolean {
  return millimes % 10 ** (3 - CURRENCIES[code].decimals) === 0;
}
