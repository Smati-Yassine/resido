import type ExcelJS from "exceljs";
import type { Locale } from "@/lib/i18n/dictionaries";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";

/**
 * What every Résido workbook shares (docs/09-excel-exports.md): column
 * definitions in both languages, money as numbers in the currency's units
 * with its decimals, real Excel dates, the app's status words — and one way
 * to lay a table out.
 */

export type Col = { header: Record<Locale, string>; width: number; kind?: "money" | "date" | "percent" };
export type Cell = string | number | Date | null;

export const col = (fr: string, en: string, width: number, kind?: Col["kind"]): Col => ({
  header: { fr, en },
  width,
  kind,
});

/** Excel number format with the currency's decimals: "#,##0.000" (TND), "#,##0.00" (EUR…). */
export const moneyFormat = (currency: CurrencyCode) => `#,##0.${"0".repeat(CURRENCIES[currency].decimals)}`;
export const DATE_FORMAT = "dd/mm/yyyy";
/** Stored millimes (thousandths) as the currency's units. */
export const units = (millimes: number) => millimes / 1000;

/** The app's status and method words, for cells that hold one. */
export const LABELS: Record<string, Record<Locale, string>> = {
  ACTIVE: { fr: "Active", en: "Active" },
  ARCHIVED: { fr: "Archivée", en: "Archived" },
  DRAFT: { fr: "En préparation", en: "In preparation" },
  OPEN: { fr: "En cours", en: "In progress" },
  CLOSED: { fr: "Clôturé", en: "Closed" },
  PENDING: { fr: "Impayé", en: "Unpaid" },
  PARTIALLY_PAID: { fr: "Partiel", en: "Partial" },
  PAID: { fr: "Payé", en: "Paid" },
  PARTIAL: { fr: "Partiel", en: "Partial" },
  UNPAID: { fr: "Impayé", en: "Unpaid" },
  CANCELLED: { fr: "Annulé", en: "Cancelled" },
  CASH: { fr: "Espèces", en: "Cash" },
  BANK_TRANSFER: { fr: "Virement", en: "Bank transfer" },
  CHECK: { fr: "Chèque", en: "Cheque" },
};
export const label = (code: string, locale: Locale) => LABELS[code]?.[locale] ?? code;

/** When a file was made, as its caption says it (Tunis time, like the residences). */
export const stamp = (locale: Locale) =>
  new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date());

const MUTED = "FF5E6470";
const HEAD_FILL = "FFEEE8DE";

/**
 * One table on its own sheet: caption lines first (what the file covers and
 * when it was made — a downloaded file explains itself), then the header row,
 * frozen and filterable, the rows, and a totals row summing the `total`
 * columns when there are any.
 */
export function addTable(
  workbook: ExcelJS.Workbook,
  {
    name,
    caption,
    columns,
    rows,
    currency,
    locale,
    total,
  }: {
    name: string;
    caption: string[];
    columns: Col[];
    rows: Cell[][];
    currency: CurrencyCode;
    locale: Locale;
    /** Indexes of the columns to add up in a last row. */
    total?: number[];
  },
) {
  const headerAt = caption.length + 2; // the captions, a blank line, then the header
  const sheet = workbook.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: headerAt }] });
  sheet.columns = columns.map((c) => ({ width: c.width }));

  caption.forEach((line, i) => {
    const row = sheet.addRow([line]);
    row.font = i === 0 ? { bold: true, size: 13 } : { italic: true, color: { argb: MUTED } };
  });
  sheet.addRow([]);
  const header = sheet.addRow(columns.map((c) => c.header[locale]));
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };

  const format = (row: ExcelJS.Row) =>
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.kind === "money") cell.numFmt = moneyFormat(currency);
      if (c.kind === "date") cell.numFmt = DATE_FORMAT;
      if (c.kind === "percent") cell.numFmt = "0%";
    });
  for (const values of rows) format(sheet.addRow(values));

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerAt, column: 1 },
      to: { row: headerAt + rows.length, column: columns.length },
    };
  }
  if (total?.length && rows.length > 0) {
    const sums: Cell[] = columns.map((_, i) =>
      total.includes(i) ? rows.reduce((n, r) => n + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : null,
    );
    sums[0] = "Total"; // the same word in both languages
    const row = sheet.addRow(sums);
    row.font = { bold: true };
    row.border = { top: { style: "thin" } };
    format(row);
  }
  return sheet;
}

/** Label / value pairs, one per line (a summary sheet). */
export function addSummary(
  workbook: ExcelJS.Workbook,
  {
    name,
    caption,
    lines,
    currency,
  }: {
    name: string;
    caption: string[];
    lines: { label: string; value: Cell; kind?: Col["kind"]; strong?: boolean }[];
    currency: CurrencyCode;
  },
) {
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.columns = [{ width: 36 }, { width: 20 }];
  caption.forEach((line, i) => {
    const row = sheet.addRow([line]);
    row.font = i === 0 ? { bold: true, size: 13 } : { italic: true, color: { argb: MUTED } };
  });
  sheet.addRow([]);
  for (const line of lines) {
    if (!line.label) {
      sheet.addRow([]);
      continue;
    }
    const row = sheet.addRow([line.label, line.value]);
    if (line.strong) row.font = { bold: true };
    const cell = row.getCell(2);
    if (line.kind === "money") cell.numFmt = moneyFormat(currency);
    if (line.kind === "percent") cell.numFmt = "0%";
    if (line.kind === "date") cell.numFmt = DATE_FORMAT;
  }
  return sheet;
}
