import type { AuditEntry } from "@/lib/audit/log";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatAmount } from "@/lib/format";
import type { CurrencyCode } from "@/lib/currency";

const AMOUNT_KEYS = [
  "amountMillimes",
  "chargeMillimes",
  "openingTreasuryBalanceMillimes",
  "closingTreasuryBalanceMillimes",
];

/** One readable line from an entry's metadata: who / what it was about, and the amount if any. */
export function describeAuditEntry(entry: AuditEntry, t: Dictionary, currency: CurrencyCode): string {
  const m = entry.metadata;
  const parts: string[] = [];
  for (const key of ["name", "label", "code", "email"]) {
    if (typeof m[key] === "string" && m[key]) parts.push(m[key] as string);
  }
  if (typeof m.role === "string") {
    const label = (t as Record<string, string>)[`role${m.role}`];
    if (label) parts.push(label);
  }
  if (typeof m.currency === "string") parts.push(m.currency);
  const amountKey = AMOUNT_KEYS.find((k) => typeof m[k] === "number");
  if (amountKey) parts.push(formatAmount(m[amountKey] as number, currency));
  if (typeof m.reason === "string") parts.push(`« ${m.reason} »`);
  return parts.join(" · ") || "—";
}
