import type ExcelJS from "exceljs";
import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import type { CurrencyCode } from "@/lib/currency";
import { formatMonth } from "@/lib/format";
import { C } from "@/lib/print/pdf/theme";
import type { PrintData, PrintPayment } from "@/lib/print/load";
import { DATE_FORMAT, moneyFormat, units, type Cell } from "./sheets";

/**
 * A cycle's printed report as Excel sheets (docs/09-excel-exports.md): the
 * same pages as the PDF (lib/print/pdf), in the same order and with the same
 * words — the summary (the cover's figures, treasury, blocs, payment methods
 * and months), the ledger by bloc with its owners and phones, the payments
 * and the expenses month by month — each group with its subtotal and the
 * whole with its total, as live SUBTOTAL formulas.
 */

export interface ReportCtx {
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
  residence: { name: string; city: string };
  cycle: { name: string; status: "DRAFT" | "OPEN" | "CLOSED"; range: string };
  /** When the file was made, as its header says it. */
  generatedOn: string;
}

export type ReportPart = "summary" | "property" | "payments" | "expenses";

/** The printed documents, as the sheets that make them. */
export const REPORT_PARTS = {
  property: ["property"],
  payments: ["payments"],
  expenses: ["expenses"],
  report: ["summary", "property", "payments", "expenses"],
} satisfies Record<string, ReportPart[]>;

export const PART_NAMES: Record<ReportPart, Record<Locale, string>> = {
  summary: { fr: "Synthèse", en: "Summary" },
  property: { fr: "Copropriété", en: "Property" },
  payments: { fr: "Encaissements", en: "Payments" },
  expenses: { fr: "Dépenses", en: "Expenses" },
};

/**
 * Adds the report's sheets for one cycle. `nameOf` names each sheet (the
 * whole-residence file puts the cycle first: "2025 — Synthèse"); a cycle not
 * billed yet has only its ledger, charges alone, as the PDF prints it.
 */
export function addReportSheets(
  workbook: ExcelJS.Workbook,
  ctx: ReportCtx,
  data: PrintData,
  parts: readonly ReportPart[],
  nameOf: (part: ReportPart) => string = (part) => PART_NAMES[part][ctx.locale],
) {
  const billed = data.property.billed;
  for (const part of parts) {
    if (!billed && part !== "property") continue;
    const sheet = workbook.addWorksheet(sheetName(workbook, nameOf(part)), {
      properties: { tabColor: { argb: argb(C.primary) } },
      views: [{ showGridLines: false }],
    });
    const { t } = ctx;
    ({ summary: addSummary, property: addProperty, payments: addPayments, expenses: addExpenses })[part](
      sheet,
      ctx,
      data,
      { summary: t.docReport, property: t.docProperty, payments: t.docPayments, expenses: t.docExpenses }[part],
    );
  }
}

/* ---------- The pieces every page shares ---------- */

type Kind = "money" | "percent" | "date";
interface Column {
  label: string;
  /** Characters; the summary's small tables share the sheet's widths. */
  width?: number;
  kind?: Kind;
  align?: "left" | "right" | "center";
}
type Formula = { formula: string; result: number };
type Value = Cell | Formula;

const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const line = (hex: string, style: ExcelJS.BorderStyle = "thin"): Partial<ExcelJS.Border> => ({
  style,
  color: { argb: argb(hex) },
});
const letter = (column: number) => String.fromCharCode(64 + column);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Excel's rules for a tab: 31 characters, none of []:*?/\, and no two alike. */
function sheetName(workbook: ExcelJS.Workbook, wanted: string) {
  const clean = wanted.replace(/[[\]:*?/\\]/g, "-").trim();
  const taken = new Set(workbook.worksheets.map((w) => w.name.toLowerCase()));
  let name = clean.slice(0, 31);
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean.slice(0, 31 - ` (${n})`.length)} (${n})`;
  return name;
}

/** The page's header, as the PDF's: residence and city, then the document, its cycle and when it was made. */
function header(sheet: ExcelJS.Worksheet, ctx: ReportCtx, title: string) {
  const { t, cycle } = ctx;
  const rows: [string, Partial<ExcelJS.Font>][] = [
    [ctx.residence.name, { bold: true, size: 16, color: { argb: argb(C.night) } }],
    [ctx.residence.city, { color: { argb: argb(C.muted) } }],
    [title, { bold: true, size: 13, color: { argb: argb(C.primary) } }],
    [
      `${cycle.name} · ${t[`status${cycle.status}`]} · ${cycle.range}`,
      { color: { argb: argb(C.ink2) } },
    ],
    [interpolate(t.printedOn, { date: ctx.generatedOn }) + " · Résido", { italic: true, color: { argb: argb(C.muted) } }],
  ];
  for (const [text, font] of rows) {
    if (!text) continue;
    sheet.addRow([text]).font = font;
  }
  sheet.addRow([]);
}

/** Printing the sheet: A4, one page wide, the column titles on every page. */
function printSetup(sheet: ExcelJS.Worksheet, headRow: number, landscape = false) {
  sheet.pageSetup = {
    paperSize: 9,
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headRow}:${headRow}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.views = [{ state: "frozen", ySplit: headRow, showGridLines: false }];
}

function put(cell: ExcelJS.Cell, value: Value, col: Column | undefined, currency: CurrencyCode, kind = col?.kind) {
  cell.value = value as ExcelJS.CellValue;
  if (kind === "money") cell.numFmt = moneyFormat(currency);
  if (kind === "percent") cell.numFmt = "0%";
  if (kind === "date") cell.numFmt = DATE_FORMAT;
  const align = col?.align ?? (kind === "money" || kind === "percent" ? "right" : "left");
  cell.alignment = { vertical: "middle", horizontal: align, wrapText: kind === undefined };
}

/** A ledger: its column titles, then groups (a bloc, a month) each with a subtotal, then the total. */
class Ledger {
  readonly head: number;
  private first = 0;
  private firstGroup = 0;
  constructor(
    private sheet: ExcelJS.Worksheet,
    private columns: Column[],
    private currency: CurrencyCode,
  ) {
    sheet.columns = columns.map((c) => ({ width: c.width }));
    const row = sheet.addRow(columns.map((c) => c.label.toUpperCase()));
    row.height = 20;
    row.eachCell((cell, i) => {
      cell.font = { bold: true, size: 9, color: { argb: argb(C.muted) } };
      cell.fill = fill(C.ground);
      cell.border = { bottom: line(C.ink, "medium") };
      cell.alignment = {
        vertical: "middle",
        horizontal: columns[i - 1].align ?? (columns[i - 1].kind === "money" ? "right" : "left"),
      };
    });
    this.head = row.number;
  }

  /** The band opening a group: its name, and how many lines it holds on the right. */
  group(label: string, detail: string) {
    const row = this.sheet.addRow([label, ...Array(this.columns.length - 2).fill(null), detail]);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.fill = fill(C.primarySoft);
      cell.font = i === 1 ? { bold: true, color: { argb: argb(C.night) } } : { bold: true, color: { argb: argb(C.primary) } };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "right" };
    });
    this.firstGroup = row.number + 1;
    if (!this.first) this.first = this.firstGroup;
  }

  /** One line; `style` colours single cells (a status, what is left to pay). */
  row(values: Value[], style: (cell: ExcelJS.Cell, index: number) => void = () => {}) {
    const row = this.sheet.addRow([]);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      put(cell, v, this.columns[i], this.currency);
      cell.border = { bottom: line(C.lineSoft) };
      style(cell, i);
    });
    if (!this.first) this.first = row.number;
    return row;
  }

  /** A cell's address, for a formula: "D12". */
  cellRef(index: number, row: number) {
    return `${letter(index + 1)}${row}`;
  }

  private sums(from: number, to: number, cells: Value[], sum: number[], results: number[]) {
    return cells.map((c, i) => {
      const at = sum.indexOf(i);
      if (at < 0) return c;
      return { formula: `SUBTOTAL(9,${letter(i + 1)}${from}:${letter(i + 1)}${to})`, result: results[at] };
    });
  }

  /** The group's subtotal: `sum` names the columns added up, `results` their values. */
  subtotal(cells: Value[], sum: number[], results: number[]) {
    const to = this.sheet.lastRow!.number;
    const row = this.sheet.addRow([]);
    this.sums(this.firstGroup, to, cells, sum, results).forEach((v, i) => {
      const cell = row.getCell(i + 1);
      put(cell, v, this.columns[i], this.currency);
      cell.fill = fill(C.surface2);
      cell.font = { bold: true };
      cell.border = { bottom: line(C.line) };
    });
    return row;
  }

  /** The grand total: SUBTOTAL leaves the subtotals above out of the sum. */
  total(cells: Value[], sum: number[], results: number[]) {
    const to = this.sheet.lastRow!.number;
    const row = this.sheet.addRow([]);
    row.height = 20;
    this.sums(this.first || to + 1, to, cells, sum, results).forEach((v, i) => {
      const cell = row.getCell(i + 1);
      put(cell, v, this.columns[i], this.currency);
      cell.font = { bold: true, size: 11 };
      cell.border = { top: line(C.ink), bottom: line(C.ink, "double") };
    });
    return row;
  }
}

const STATUS_COLORS = {
  PAID: { bg: C.paidBg, fg: C.paidFg },
  PARTIAL: { bg: C.partialBg, fg: C.partialFg },
  UNPAID: { bg: C.unpaidBg, fg: C.unpaidFg },
} as const;

/* ---------- Copropriété: every lot by bloc ---------- */

function addProperty(sheet: ExcelJS.Worksheet, ctx: ReportCtx, data: PrintData, title: string) {
  const { t, currency } = ctx;
  const billed = data.property.billed;
  header(sheet, ctx, title);
  const columns: Column[] = billed
    ? [
        { label: t.colLot, width: 12 },
        { label: t.ownersLabel, width: 34 },
        { label: t.colPhone, width: 22 },
        { label: t.colCharge, width: 15, kind: "money" },
        { label: t.colPaid, width: 15, kind: "money" },
        { label: t.colRemaining, width: 15, kind: "money" },
        { label: t.colStatus, width: 12, align: "center" },
        { label: t.colMethods, width: 24 },
      ]
    : [
        { label: t.colLot, width: 12 },
        { label: t.ownersLabel, width: 38 },
        { label: t.colPhone, width: 24 },
        { label: t.colCharge, width: 16, kind: "money" },
      ];
  const ledger = new Ledger(sheet, columns, currency);
  const money = billed ? [3, 4, 5] : [3];
  const sums = (lots: PrintData["byBloc"][number]["lots"]) => {
    const charge = lots.reduce((n, l) => n + l.chargeMillimes, 0);
    const paid = lots.reduce((n, l) => n + l.paidMillimes, 0);
    return billed ? [units(charge), units(paid), units(charge - paid)] : [units(charge)];
  };
  const blank = Array(columns.length).fill(null) as Value[];

  for (const bloc of data.byBloc) {
    ledger.group(bloc.name, interpolate(t.lotsCount, { count: bloc.lots.length }));
    for (const l of bloc.lots) {
      const r = sheet.lastRow!.number + 1;
      const owed = l.chargeMillimes - l.paidMillimes;
      const base: Value[] = [l.code, l.owners || "—", l.phones, units(l.chargeMillimes)];
      ledger.row(
        billed
          ? [
              ...base,
              units(l.paidMillimes),
              { formula: `${ledger.cellRef(3, r)}-${ledger.cellRef(4, r)}`, result: units(owed) },
              l.status ? t[`status${l.status}`] : "",
              l.methods.map((m) => t[`method${m}`]).join(", "),
            ]
          : base,
        (cell, i) => {
          if (i === 0) cell.font = { bold: true };
          if (i === 5) cell.font = { bold: true, color: { argb: argb(owed > 0 ? C.neg : C.ink) } };
          if (i === 6 && l.status) {
            cell.fill = fill(STATUS_COLORS[l.status].bg);
            cell.font = { bold: true, size: 9, color: { argb: argb(STATUS_COLORS[l.status].fg) } };
          }
        },
      );
    }
    const cells = [...blank];
    cells[0] = t.subtotal;
    cells[1] = bloc.name;
    ledger.subtotal(cells, money, sums(bloc.lots));
  }

  const all = data.byBloc.flatMap((b) => b.lots);
  const cells = [...blank];
  cells[0] = t.grandTotal;
  cells[1] = interpolate(t.lotsCount, { count: all.length });
  const totalRow = ledger.total(cells, money, sums(all));
  if (billed) {
    // The collection rate under the statuses, as the PDF's total line gives it.
    const r = totalRow.number;
    const [charge, paid] = sums(all);
    put(
      totalRow.getCell(7),
      { formula: `IF(D${r}=0,0,E${r}/D${r})`, result: charge ? paid / charge : 0 },
      columns[6],
      currency,
      "percent",
    );
    totalRow.getCell(7).alignment = { horizontal: "center" };
  }
  printSetup(sheet, ledger.head, true);
}

/* ---------- Encaissements: month by month, then by method ---------- */

function addPayments(sheet: ExcelJS.Worksheet, ctx: ReportCtx, data: PrintData, title: string) {
  const { t, locale, currency } = ctx;
  header(sheet, ctx, title);
  const columns: Column[] = [
    { label: t.colDate, width: 12, kind: "date" },
    { label: t.colLots, width: 22 },
    { label: t.colPayer, width: 26 },
    { label: t.colMethod, width: 14 },
    { label: t.colNote, width: 32 },
    { label: t.total, width: 16, kind: "money" },
  ];
  const ledger = new Ledger(sheet, columns, currency);
  if (data.payments.length === 0) {
    sheet.addRow([t.noPaymentsText]).font = { italic: true, color: { argb: argb(C.muted) } };
    printSetup(sheet, ledger.head);
    return;
  }
  const months = new Map<string, PrintPayment[]>();
  for (const p of data.payments) {
    const key = p.date.toISOString().slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p]);
  }
  const sum = (list: PrintPayment[]) => units(list.reduce((n, p) => n + p.amountMillimes, 0));
  for (const [month, list] of months) {
    ledger.group(capitalize(formatMonth(month, locale)), interpolate(t.paymentsCount, { count: list.length }));
    for (const p of list) {
      ledger.row([p.date, p.lots, p.payer, t[`method${p.method}`], p.note, units(p.amountMillimes)], (cell, i) => {
        if (i === 1) cell.font = { bold: true };
      });
    }
    ledger.subtotal([t.subtotal, null, null, null, null, null], [5], [sum(list)]);
  }
  ledger.total(
    [t.total, interpolate(t.paymentsCount, { count: data.payments.length }), null, null, null, null],
    [5],
    [sum(data.payments)],
  );

  // How it was paid, as the box under the PDF's list.
  const total = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  sheet.addRow([]);
  miniTable(sheet, currency, {
    title: t.byMethodTitle,
    columns: [
      { label: t.colMethod },
      { label: ctx.locale === "fr" ? "Nombre" : "Count", align: "right" },
      { label: t.total, kind: "money" },
      { label: "%", kind: "percent" },
    ],
    rows: data.methods.map((m) => [t[`method${m.method}`], m.count, units(m.totalMillimes), total ? m.totalMillimes / total : 0]),
    total: [t.total, data.methods.reduce((n, m) => n + m.count, 0), units(total), total ? 1 : 0],
  });
  printSetup(sheet, ledger.head);
}

/* ---------- Dépenses: month by month ---------- */

function addExpenses(sheet: ExcelJS.Worksheet, ctx: ReportCtx, data: PrintData, title: string) {
  const { t, locale, currency } = ctx;
  header(sheet, ctx, title);
  const columns: Column[] = [
    { label: t.colDate, width: 12, kind: "date" },
    { label: t.colLabel, width: 44 },
    { label: t.colReference, width: 22 },
    { label: t.total, width: 16, kind: "money" },
  ];
  const ledger = new Ledger(sheet, columns, currency);
  const months = data.expenseMonths;
  if (months.length === 0) {
    sheet.addRow([t.noExpensesYet]).font = { italic: true, color: { argb: argb(C.muted) } };
    printSetup(sheet, ledger.head);
    return;
  }
  for (const mo of months) {
    ledger.group(capitalize(formatMonth(mo.month, locale)), interpolate(t.expensesCount, { count: mo.items.length }));
    for (const e of mo.items) {
      ledger.row([e.date, e.label, e.reference ?? "", units(e.amountMillimes)], (cell, i) => {
        if (i === 1) cell.font = { bold: true };
      });
    }
    ledger.subtotal([t.subtotal, null, null, null], [3], [units(mo.totalMillimes)]);
  }
  const count = months.reduce((n, m) => n + m.items.length, 0);
  ledger.total(
    [t.total, interpolate(t.expensesCount, { count }), null, null],
    [3],
    [units(months.reduce((n, m) => n + m.totalMillimes, 0))],
  );
  printSetup(sheet, ledger.head);
}

/* ---------- Synthèse: the cover's figures ---------- */

/** A titled table on a summary: its title and one sentence under it, the column titles, rows, a total. */
function miniTable(
  sheet: ExcelJS.Worksheet,
  currency: CurrencyCode,
  {
    title,
    hint,
    columns,
    rows,
    kinds,
    total,
  }: {
    title: string;
    hint?: string;
    columns: Column[];
    rows: Value[][];
    /** Per row, a format overriding the columns' (a rate among amounts). */
    kinds?: (Kind | undefined)[];
    total?: Value[];
  },
) {
  sheet.addRow([title]).font = { bold: true, size: 12, color: { argb: argb(C.night) } };
  if (hint) sheet.addRow([hint]).font = { italic: true, color: { argb: argb(C.muted) } };
  if (columns.some((c) => c.label)) {
    const head = sheet.addRow(columns.map((c) => c.label.toUpperCase()));
    head.eachCell((cell, i) => {
      cell.font = { bold: true, size: 9, color: { argb: argb(C.muted) } };
      cell.fill = fill(C.ground);
      cell.border = { bottom: line(C.ink) };
      cell.alignment = {
        horizontal: columns[i - 1].align ?? (columns[i - 1].kind ? "right" : "left"),
      };
    });
  }
  rows.forEach((values, r) => {
    const row = sheet.addRow([]);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      put(cell, v, columns[i], currency, i > 0 && columns[i]?.kind && kinds?.[r] ? kinds[r] : columns[i]?.kind);
      cell.border = { bottom: line(C.lineSoft) };
      if (i === 0) cell.font = { bold: true };
    });
  });
  if (total) {
    const row = sheet.addRow([]);
    total.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      put(cell, v, columns[i], currency);
      cell.font = { bold: true };
      cell.border = { top: line(C.ink), bottom: line(C.ink, "double") };
    });
  }
  sheet.addRow([]);
}

function addSummary(sheet: ExcelJS.Worksheet, ctx: ReportCtx, data: PrintData, title: string) {
  const { t, locale, currency } = ctx;
  const { totals, treasury, before } = data;
  const closed = ctx.cycle.status === "CLOSED";
  sheet.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }];
  header(sheet, ctx, title);
  const rate = (collected: number, expected: number) => (expected ? collected / expected : 0);

  // The four figures and the rate, each with what it means — and the cycle before, as the dashboard compares.
  const kpis: [string, number, number | null, string][] = [
    [
      t.kpiExpected,
      units(totals.expectedMillimes),
      before && units(before.expectedMillimes),
      interpolate(t.coverExpectedText, { count: totals.lotCount }),
    ],
    [t.kpiCollected, units(totals.collectedMillimes), before && units(before.collectedMillimes), t.coverCollectedText],
    [
      t.kpiOutstanding,
      units(totals.outstandingMillimes),
      before && units(before.outstandingMillimes),
      t.coverOutstandingText,
    ],
    [t.kpiBalance, units(treasury.closingBalanceMillimes), before && units(before.balanceMillimes), t.coverBalanceText],
    [
      t.kpiRate,
      rate(totals.collectedMillimes, totals.expectedMillimes),
      before && before.rate / 100,
      interpolate(t.coverLotsPaid, { paid: totals.paid, total: totals.lotCount }),
    ],
  ];
  const previous = before
    ? interpolate(data.toDate ? t.vsPreviousToDate : t.vsPrevious, { name: before.name })
    : null;
  miniTable(sheet, currency, {
    title: ctx.cycle.name,
    hint: previous ?? t.coverFirstCycle,
    columns: [
      { label: "" },
      { label: ctx.cycle.name, kind: "money" },
      ...(before ? [{ label: before.name, kind: "money" as const }] : []),
      { label: "" },
    ],
    rows: kpis.map(([label, value, then, text]) => (before ? [label, value, then, text] : [label, value, text])),
    kinds: kpis.map((_, i) => (i === kpis.length - 1 ? "percent" : undefined)),
  });

  miniTable(sheet, currency, {
    title: t.treasurySummary,
    hint: t.coverTreasuryText,
    columns: [
      { label: "" },
      { label: "", kind: "money" },
      { label: "" },
    ],
    rows: [
      [t.startBalance, units(treasury.openingBalanceMillimes), t.coverStartText],
      [t.plusIncome, units(treasury.incomeMillimes), t.coverInText],
      [t.minusExpenses, -units(treasury.expenseMillimes), t.coverOutText],
    ],
    total: [
      closed ? t.closingBalance : t.currentBalance,
      units(treasury.closingBalanceMillimes),
      t.coverBalanceText,
    ],
  });

  miniTable(sheet, currency, {
    title: t.coverBlocs,
    hint: t.coverBlocsText,
    columns: [
      { label: t.colBloc },
      { label: t.colLots, align: "right" },
      { label: t.kpiExpected, kind: "money" },
      { label: t.kpiCollected, kind: "money" },
      { label: t.kpiOutstanding, kind: "money" },
      { label: t.kpiRate, kind: "percent" },
    ],
    rows: data.blocProgress.map((b) => [
      b.name,
      b.lotCount,
      units(b.expectedMillimes),
      units(b.collectedMillimes),
      units(b.expectedMillimes - b.collectedMillimes),
      rate(b.collectedMillimes, b.expectedMillimes),
    ]),
    total: [
      t.total,
      totals.lotCount,
      units(totals.expectedMillimes),
      units(totals.collectedMillimes),
      units(totals.outstandingMillimes),
      rate(totals.collectedMillimes, totals.expectedMillimes),
    ],
  });

  const methodTotal = data.methods.reduce((n, m) => n + m.totalMillimes, 0);
  miniTable(sheet, currency, {
    title: t.byMethodTitle,
    columns: [
      { label: t.colMethod },
      { label: locale === "fr" ? "Nombre" : "Count", align: "right" },
      { label: t.total, kind: "money" },
      { label: "%", kind: "percent" },
    ],
    rows: data.methods.map((m) => [
      t[`method${m.method}`],
      m.count,
      units(m.totalMillimes),
      methodTotal ? m.totalMillimes / methodTotal : 0,
    ]),
    total: [t.total, data.methods.reduce((n, m) => n + m.count, 0), units(methodTotal), methodTotal ? 1 : 0],
  });

  miniTable(sheet, currency, {
    title: t.coverFlows,
    columns: [
      { label: locale === "fr" ? "Mois" : "Month" },
      { label: t.coverIn, kind: "money" },
      { label: t.coverOut, kind: "money" },
      { label: t.coverBalance, kind: "money" },
    ],
    rows: data.flows.map((f) => [
      capitalize(formatMonth(f.month, locale)),
      units(f.incomeMillimes),
      units(f.expenseMillimes),
      units(f.balanceMillimes),
    ]),
  });

  sheet.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}
