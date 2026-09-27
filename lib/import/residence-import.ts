import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { withTransaction } from "@/lib/db/transaction";
import { newTimestamps } from "@/lib/db/timestamps";
import { fromDecimalString, MoneyError } from "@/lib/money";
import { CURRENCIES, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from "@/lib/currency";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/payments/methods";
import { CYCLE_STATUSES, type CycleStatus } from "@/lib/domain/cycles/schema";
import * as residencesRepo from "@/lib/domain/residences/repository";
import * as membershipsRepo from "@/lib/domain/memberships/repository";
import type { Residence } from "@/lib/domain/residences/schema";
import { writeAuditLog } from "@/lib/audit/log";
import { fold } from "@/lib/text";
import { LABELS, type Col } from "@/lib/export/sheets";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  headerKey,
  isHeader,
  RESIDENCE_COLUMNS,
  RESIDENCE_LINES,
  RESIDENCE_SHEETS,
  splitList,
  YES_WORDS,
  type ResidenceSheet,
  type TableSheet,
} from "@/lib/export/residence-format";

/**
 * Creates a residence from a residence workbook (lib/export/residence-format.ts)
 * — one exported by Résido, possibly edited, or filled in by hand. Nothing is
 * merged into an existing residence: the import always makes a new one,
 * owned by whoever imports it.
 *
 * The file is read and checked whole first (parseResidenceWorkbook): every
 * problem found is reported with its sheet and row, and nothing is written
 * unless there are none. Then every record goes in, in one transaction.
 * What the app works out itself is worked out again, never trusted from the
 * file: what each lot has paid and its status come from the payments, a
 * payment's amount from how it is split, each cycle's closing balance from
 * its movements.
 */

/** What can be wrong with a file; the messages live in the dictionaries (importErr…). */
export type ImportIssueCode =
  | "NOT_A_WORKBOOK"
  | "SHEET_MISSING"
  | "COLUMN_MISSING"
  | "REQUIRED"
  | "BAD_AMOUNT"
  | "BAD_DATE"
  | "BAD_VALUE"
  | "DUPLICATE"
  | "UNKNOWN_REF"
  | "AMBIGUOUS_OWNER"
  | "DRAFT_CYCLE"
  | "TWO_OPEN"
  | "END_BEFORE_START"
  | "OVERPAID"
  | "PAYMENT_TOTAL"
  | "NO_ALLOCATION"
  | "CANCELLED_CHARGE";

export interface ImportIssue {
  code: ImportIssueCode;
  /** The sheet's name as it is in the file. */
  sheet?: string;
  /** The row's number in Excel. */
  row?: number;
  /** The column's header as the file has it, and the offending value. */
  column?: string;
  value?: string;
  /** A sheet or column the file lacks, by its name in each language. */
  expected?: Record<Locale, string>;
}

/** Past this many, the rest are not listed: fixing the first ones usually fixes them. */
const MAX_ISSUES = 25;

type Millimes = number;

export interface ImportPlan {
  residence: { name: string; city: string; currency: CurrencyCode };
  blocs: string[];
  owners: { name: string; phone: string | null; removed: boolean }[];
  lots: { code: string; bloc: number | null; chargeMillimes: Millimes; owners: number[] }[];
  /** Oldest first: each chained after the one before. */
  cycles: {
    name: string;
    status: CycleStatus;
    start: Date;
    end: Date | null;
    carried: boolean;
    openingMillimes: Millimes;
  }[];
  charges: { cycle: number; lot: number; amountMillimes: Millimes; owners: number[]; cancelled: boolean }[];
  payments: {
    date: Date;
    method: PaymentMethod;
    note: string | null;
    payer: string | null;
    owner: number | null;
    allocations: { charge: number; amountMillimes: Millimes }[];
  }[];
  expenses: { cycle: number; date: Date; label: string; reference: string | null; amountMillimes: Millimes }[];
}

export type ParseResult = { ok: true; plan: ImportPlan } | { ok: false; issues: ImportIssue[] };

/* ---------- Reading cells ---------- */

type Raw = string | number | boolean | Date | null;

/** A cell's value, whatever ExcelJS made of it: formulas give their result, rich text its text. */
function plain(value: ExcelJS.CellValue): Raw {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== "object") return value as Raw;
  if ("result" in value) return plain(value.result as ExcelJS.CellValue);
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("text" in value) return String(value.text);
  return null;
}

const asText = (raw: Raw) =>
  raw === null ? "" : raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim();

/** Reverse of the status and method words: any language, or the code itself. */
function codeOf<T extends string>(text: string, codes: readonly T[]): T | null {
  const wanted = fold(text.trim());
  for (const code of codes) {
    if (fold(code) === wanted || fold(code.replace(/_/g, " ")) === wanted) return code;
    const words = LABELS[code];
    if (words && Object.values(words).some((w) => fold(w) === wanted)) return code;
  }
  return null;
}

class Issues {
  list: ImportIssue[] = [];
  add(issue: ImportIssue) {
    if (this.list.length < MAX_ISSUES) this.list.push(issue);
  }
  get any() {
    return this.list.length > 0;
  }
}

/** One data row of a table sheet: its cells by column key, read and checked. */
class Row {
  constructor(
    private readonly table: Table,
    readonly number: number,
    private readonly cells: Map<string, Raw>,
  ) {}

  private issue(code: ImportIssueCode, key: string, value?: string) {
    this.table.issues.add({ code, sheet: this.table.name, row: this.number, column: this.table.header(key), value });
  }

  /** Whether the sheet has this column at all (an empty cell in it still says something). */
  hasColumn(key: string) {
    return this.cells.has(key);
  }

  text(key: string, { required = false } = {}): string {
    const text = asText(this.cells.get(key) ?? null);
    if (required && !text) this.issue("REQUIRED", key);
    return text;
  }

  /** An amount in the currency's units, as millimes; null when empty (and not required) or wrong. */
  money(key: string, { required = false, positive = false } = {}): Millimes | null {
    const raw = this.cells.get(key) ?? null;
    if (raw === null || asText(raw) === "") {
      if (required) this.issue("REQUIRED", key);
      return null;
    }
    const decimals = CURRENCIES[this.table.currency].decimals;
    let amount: number | null = null;
    try {
      // Through the one sanctioned door (lib/money): a decimal string.
      const text =
        typeof raw === "number"
          ? raw.toFixed(3)
          : asText(raw)
              .replace(/[\s  ]/g, "")
              .replace(/,(?=\d{1,3}$)/, ".")
              .replace(/,/g, "");
      amount = fromDecimalString(text);
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
    }
    if (amount === null || amount % 10 ** (3 - decimals) !== 0 || amount < 0 || (positive && amount === 0)) {
      this.issue("BAD_AMOUNT", key, asText(raw));
      return null;
    }
    return amount;
  }

  date(key: string, { required = false } = {}): Date | null {
    const raw = this.cells.get(key) ?? null;
    if (raw === null || asText(raw) === "") {
      if (required) this.issue("REQUIRED", key);
      return null;
    }
    const date = toDate(raw);
    if (!date) this.issue("BAD_DATE", key, asText(raw));
    return date;
  }

  code<T extends string>(key: string, codes: readonly T[], { required = false } = {}): T | null {
    const text = this.text(key, { required });
    if (!text) return null;
    const code = codeOf(text, codes);
    if (!code) this.issue("BAD_VALUE", key, text);
    return code;
  }

  yes(key: string): boolean | null {
    const text = this.text(key);
    return text ? YES_WORDS.includes(fold(text)) : null;
  }

  fail(code: ImportIssueCode, key: string, value?: string) {
    this.issue(code, key, value);
  }
}

/** Dates as ExcelJS reads them (UTC), Excel serial numbers, or typed "31/12/2025" / "2025-12-31". */
function toDate(raw: Raw): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return raw > 0 ? new Date(Math.round((raw - 25569) * 86_400_000)) : null;
  const text = asText(raw);
  let y: number, m: number, d: number;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** A table sheet: its header row found under the captions, its columns matched in either language. */
class Table {
  readonly rows: Row[] = [];
  private readonly headers = new Map<string, string>();

  constructor(
    readonly issues: Issues,
    readonly name: string,
    readonly currency: CurrencyCode,
  ) {}

  header(key: string) {
    return this.headers.get(key) ?? key;
  }

  static read<S extends TableSheet>(
    workbook: ExcelJS.Workbook,
    sheet: S,
    required: (keyof (typeof RESIDENCE_COLUMNS)[S] & string)[],
    issues: Issues,
    currency: CurrencyCode,
    { optional = false } = {},
  ): Table | null {
    const worksheet = findSheet(workbook, sheet);
    if (!worksheet) {
      if (!optional) issues.add({ code: "SHEET_MISSING", expected: sheetNames(sheet) });
      return null;
    }
    const columns: Record<string, Col> = RESIDENCE_COLUMNS[sheet];
    const table = new Table(issues, worksheet.name, currency);

    // The header: the first row, among the first few, naming the most of the sheet's columns.
    let headerRow = 0;
    let found = new Map<string, number>();
    const last = Math.min(worksheet.rowCount, 20);
    for (let r = 1; r <= last; r++) {
      const here = new Map<string, number>();
      worksheet.getRow(r).eachCell((cell, c) => {
        const text = asText(plain(cell.value));
        const key = Object.keys(columns).find((k) => !here.has(k) && isHeader(columns[k], text));
        if (key) {
          here.set(key, c);
          table.headers.set(key, text);
        }
      });
      if (here.size > found.size) [headerRow, found] = [r, here];
    }
    for (const key of required) {
      if (!found.has(key)) {
        issues.add({ code: "COLUMN_MISSING", sheet: worksheet.name, expected: columns[key].header });
      }
    }
    if (!headerRow || required.some((k) => !found.has(k))) return null;

    for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const cells = new Map<string, Raw>();
      for (const [key, c] of found) cells.set(key, plain(row.getCell(c).value));
      const values = [...cells.values()].filter((v) => asText(v) !== "");
      if (values.length === 0) continue;
      // The totals row a Résido export ends its tables with.
      const texts = values.filter((v) => typeof v === "string");
      if (asText(plain(row.getCell(1).value)) === "Total" && texts.length === 1) continue;
      table.rows.push(new Row(table, r, cells));
    }
    return table;
  }
}

const sheetNames = (sheet: ResidenceSheet) => ({ fr: RESIDENCE_SHEETS[sheet].fr, en: RESIDENCE_SHEETS[sheet].en });

function findSheet(workbook: ExcelJS.Workbook, sheet: ResidenceSheet) {
  const names = [RESIDENCE_SHEETS[sheet].fr, RESIDENCE_SHEETS[sheet].en].map(headerKey);
  return workbook.worksheets.find((w) => names.includes(headerKey(w.name)));
}

/* ---------- The file, checked into a plan ---------- */

export async function parseResidenceWorkbook(file: Buffer | ArrayBuffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS's types predate Node's generic Buffer.
    await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return { ok: false, issues: [{ code: "NOT_A_WORKBOOK" }] };
  }
  const issues = new Issues();

  /* The residence: label / value lines. */
  const info = findSheet(workbook, "residence");
  const lines = new Map<keyof typeof RESIDENCE_LINES, Raw>();
  if (!info) issues.add({ code: "SHEET_MISSING", expected: sheetNames("residence") });
  else {
    info.eachRow((row) => {
      const label = asText(plain(row.getCell(1).value));
      const key = (Object.keys(RESIDENCE_LINES) as (keyof typeof RESIDENCE_LINES)[]).find((k) =>
        isHeader(RESIDENCE_LINES[k], label),
      );
      if (key && !lines.has(key)) lines.set(key, plain(row.getCell(2).value));
    });
  }
  const name = asText(lines.get("name") ?? null);
  if (info && !name) issues.add({ code: "REQUIRED", sheet: info.name, expected: RESIDENCE_LINES.name.header });
  const currencyText = asText(lines.get("currency") ?? null).toUpperCase();
  let currency: CurrencyCode = DEFAULT_CURRENCY;
  if (currencyText) {
    if (isCurrencyCode(currencyText)) currency = currencyText;
    else {
      issues.add({ code: "BAD_VALUE", sheet: info?.name, expected: RESIDENCE_LINES.currency.header, value: currencyText });
    }
  }
  const plan: ImportPlan = {
    residence: { name, city: asText(lines.get("city") ?? null), currency },
    blocs: [],
    owners: [],
    lots: [],
    cycles: [],
    charges: [],
    payments: [],
    expenses: [],
  };

  const read = <S extends TableSheet>(
    sheet: S,
    required: (keyof (typeof RESIDENCE_COLUMNS)[S] & string)[],
    options?: { optional?: boolean },
  ) => Table.read(workbook, sheet, required, issues, currency, options);
  const blocSheet = read("blocs", ["name"], { optional: true });
  const ownerSheet = read("owners", ["name"], { optional: true });
  const lotSheet = read("lots", ["code", "charge"]);
  const cycleSheet = read("cycles", ["name", "status", "start"]);
  const chargeSheet = read("charges", ["cycle", "lot", "charge"], { optional: true });
  const paymentSheet = read("payments", ["number", "date", "method", "amount"], { optional: true });
  const allocationSheet = read("allocations", ["payment", "cycle", "lot", "amount"], { optional: true });
  const expenseSheet = read("expenses", ["cycle", "date", "label", "amount"], { optional: true });

  /* Blocs — also any named only on a lot. */
  const blocIndex = new Map<string, number>();
  const bloc = (name: string) => {
    const key = fold(name);
    if (!blocIndex.has(key)) blocIndex.set(key, plan.blocs.push(name) - 1);
    return blocIndex.get(key)!;
  };
  for (const row of blocSheet?.rows ?? []) {
    const name = row.text("name", { required: true });
    if (!name) continue;
    if (blocIndex.has(fold(name))) row.fail("DUPLICATE", "name", name);
    else bloc(name);
  }

  /* Owners, by ref and by name. */
  const ownerByRef = new Map<string, number>();
  const ownersByName = new Map<string, number[]>();
  for (const row of ownerSheet?.rows ?? []) {
    const name = row.text("name", { required: true });
    if (!name) continue;
    const index =
      plan.owners.push({ name, phone: row.text("phone") || null, removed: row.yes("removed") ?? false }) - 1;
    const ref = row.text("ref");
    if (ref) {
      if (ownerByRef.has(fold(ref))) row.fail("DUPLICATE", "ref", ref);
      ownerByRef.set(fold(ref), index);
    }
    ownersByName.set(fold(name), [...(ownersByName.get(fold(name)) ?? []), index]);
  }
  /** A row's owners: by their refs, else by name ("A & B") — a name not in Owners adds that owner. */
  const ownersOf = (row: Row): number[] => {
    const refs = splitList(row.text("ownerRefs"));
    if (refs.length) {
      return refs.flatMap((ref) => {
        const index = ownerByRef.get(fold(ref));
        if (index === undefined) row.fail("UNKNOWN_REF", "ownerRefs", ref);
        return index === undefined ? [] : [index];
      });
    }
    return row
      .text("owners")
      .split("&")
      .map((s) => s.trim())
      .filter(Boolean)
      .flatMap((name) => {
        const found = ownersByName.get(fold(name)) ?? [];
        if (found.length > 1) {
          row.fail("AMBIGUOUS_OWNER", "owners", name);
          return [];
        }
        if (found.length === 1) return found;
        const index = plan.owners.push({ name, phone: null, removed: false }) - 1;
        ownersByName.set(fold(name), [index]);
        return [index];
      });
  };

  /* Lots. */
  const lotIndex = new Map<string, number>();
  for (const row of lotSheet?.rows ?? []) {
    const code = row.text("code", { required: true });
    const chargeMillimes = row.money("charge", { required: true, positive: true });
    const blocName = row.text("bloc");
    const owners = ownersOf(row);
    // Kept with a wrong charge too (reported above), so rows naming the lot do not fail with it.
    if (!code) continue;
    if (lotIndex.has(fold(code))) {
      row.fail("DUPLICATE", "code", code);
      continue;
    }
    const lot = { code, bloc: blocName ? bloc(blocName) : null, chargeMillimes: chargeMillimes ?? 0, owners };
    lotIndex.set(fold(code), plan.lots.push(lot) - 1);
  }
  const lotOf = (row: Row, key: string) => {
    const code = row.text(key, { required: true });
    const index = code ? lotIndex.get(fold(code)) : undefined;
    if (code && index === undefined) row.fail("UNKNOWN_REF", key, code);
    return index;
  };

  /* Cycles, oldest first. */
  const cycleRows: { row: Row; cycle: ImportPlan["cycles"][number]; carried: boolean | null; opening: number | null }[] = [];
  const cycleNames = new Set<string>();
  for (const row of cycleSheet?.rows ?? []) {
    const name = row.text("name", { required: true });
    const status = row.code("status", CYCLE_STATUSES, { required: true });
    const start = row.date("start", { required: true });
    const end = row.date("end", { required: status === "CLOSED" });
    const opening = row.money("opening");
    const carried = row.yes("openingSource");
    if (!name) continue;
    if (cycleNames.has(fold(name))) {
      row.fail("DUPLICATE", "name", name);
      continue;
    }
    cycleNames.add(fold(name));
    if (start && end && end.getTime() <= start.getTime()) row.fail("END_BEFORE_START", "end", asText(end));
    // A wrong status or start is reported above; the cycle stays, for the rows naming it.
    const cycle = { name, status: status ?? "CLOSED", start: start ?? new Date(0), end, carried: false, openingMillimes: 0 };
    cycleRows.push({ row, carried, opening, cycle });
  }
  cycleRows.sort((a, b) => a.cycle.start.getTime() - b.cycle.start.getTime());
  plan.cycles = cycleRows.map((c) => c.cycle);
  const open = cycleRows.filter((c) => c.cycle.status === "OPEN");
  if (open.length > 1) open.slice(1).forEach(({ row, cycle }) => row.fail("TWO_OPEN", "status", cycle.name));
  const cycleIndex = new Map(plan.cycles.map((c, i) => [fold(c.name), i]));
  /** A row's cycle — one that was billed: a draft has no charges, payments or expenses yet. */
  const billedCycleOf = (row: Row, key: string) => {
    const name = row.text(key, { required: true });
    const index = name ? cycleIndex.get(fold(name)) : undefined;
    if (name && index === undefined) row.fail("UNKNOWN_REF", key, name);
    if (index !== undefined && plan.cycles[index].status === "DRAFT") {
      row.fail("DRAFT_CYCLE", key, name);
      return undefined;
    }
    return index;
  };

  /* Charges: one per lot and cycle. */
  const chargeIndex = new Map<string, number>();
  const wrongAmount = new Set<number>();
  for (const row of chargeSheet?.rows ?? []) {
    const cycle = billedCycleOf(row, "cycle");
    const lot = lotOf(row, "lot");
    const amountMillimes = row.money("charge", { required: true });
    // Without owner columns, a cycle bills the lot's owners, as opening one does.
    const owners =
      row.hasColumn("ownerRefs") || row.hasColumn("owners") ? ownersOf(row) : lot === undefined ? [] : plan.lots[lot].owners;
    const cancelled = codeOf(row.text("status"), ["CANCELLED"] as const) === "CANCELLED";
    if (cycle === undefined || lot === undefined) continue;
    const key = `${cycle}:${lot}`;
    if (chargeIndex.has(key)) {
      row.fail("DUPLICATE", "lot", plan.lots[lot].code);
      continue;
    }
    // Kept with a wrong amount too (reported above), so the payments into it do not fail with it.
    const index = plan.charges.push({ cycle, lot, amountMillimes: amountMillimes ?? 0, owners, cancelled }) - 1;
    chargeIndex.set(key, index);
    if (amountMillimes === null) wrongAmount.add(index);
  }

  /* Payments, then how each is split between charges. */
  const paymentRows = new Map<string, { row: Row; index: number; amount: number | null; lots: string; cycles: string }>();
  for (const row of paymentSheet?.rows ?? []) {
    const number = row.text("number", { required: true });
    const date = row.date("date", { required: true });
    const method = row.code("method", PAYMENT_METHODS, { required: true });
    const amount = row.money("amount", { required: true, positive: true });
    const payerRef = row.text("payerRef");
    const owner = payerRef ? ownerByRef.get(fold(payerRef)) : undefined;
    if (payerRef && owner === undefined) row.fail("UNKNOWN_REF", "payerRef", payerRef);
    if (!number) continue;
    if (paymentRows.has(fold(number))) {
      row.fail("DUPLICATE", "number", number);
      continue;
    }
    const payer = row.text("payer") || (owner !== undefined ? plan.owners[owner].name : "");
    // Kept with wrong fields too (reported above), so its split does not fail with it.
    const index =
      plan.payments.push({
        date: date ?? new Date(0),
        method: method ?? "CASH",
        note: row.text("note") || null,
        payer: payer || null,
        owner: owner ?? null,
        allocations: [],
      }) - 1;
    paymentRows.set(fold(number), { row, index, amount, lots: row.text("lots"), cycles: row.text("cycles") });
  }
  const allocate = (row: Row, payment: number, cycle: number, lot: number, amountMillimes: number, lotKey: string) => {
    const charge = chargeIndex.get(`${cycle}:${lot}`);
    if (charge === undefined) row.fail("UNKNOWN_REF", lotKey, `${plan.lots[lot].code} · ${plan.cycles[cycle].name}`);
    else if (plan.charges[charge].cancelled) row.fail("CANCELLED_CHARGE", lotKey, plan.lots[lot].code);
    else plan.payments[payment].allocations.push({ charge, amountMillimes });
  };
  const split = new Set<number>();
  for (const row of allocationSheet?.rows ?? []) {
    const number = row.text("payment", { required: true });
    const payment = number ? paymentRows.get(fold(number)) : undefined;
    if (payment) split.add(payment.index);
    if (number && !payment) row.fail("UNKNOWN_REF", "payment", number);
    const cycle = billedCycleOf(row, "cycle");
    const lot = lotOf(row, "lot");
    const amount = row.money("amount", { required: true, positive: true });
    if (!payment || cycle === undefined || lot === undefined || amount === null) continue;
    allocate(row, payment.index, cycle, lot, amount, "lot");
  }
  for (const { row, index, amount, lots, cycles } of paymentRows.values()) {
    const payment = plan.payments[index];
    // A file without the split: a payment for one lot in one cycle settles that lot's charge.
    if (payment.allocations.length === 0 && !allocationSheet) {
      const [lot, ...otherLots] = splitList(lots);
      const [cycle, ...otherCycles] = splitList(cycles);
      const lotAt = lot ? lotIndex.get(fold(lot)) : undefined;
      const cycleAt = cycle ? cycleIndex.get(fold(cycle)) : undefined;
      if (amount !== null && !otherLots.length && !otherCycles.length && lotAt !== undefined && cycleAt !== undefined) {
        allocate(row, index, cycleAt, lotAt, amount, "lots");
      }
    }
    const total = payment.allocations.reduce((n, a) => n + a.amountMillimes, 0);
    // A split whose rows all had problems was reported with them.
    if (payment.allocations.length === 0) {
      if (!split.has(index)) row.fail("NO_ALLOCATION", "number", row.text("number"));
    } else if (amount !== null && total !== amount) row.fail("PAYMENT_TOTAL", "amount", row.text("number"));
  }

  /* No charge paid beyond what it bills. */
  const paid = new Map<number, number>();
  for (const p of plan.payments) {
    for (const a of p.allocations) paid.set(a.charge, (paid.get(a.charge) ?? 0) + a.amountMillimes);
  }
  for (const [charge, amount] of paid) {
    const c = plan.charges[charge];
    if (amount > c.amountMillimes && !wrongAmount.has(charge)) {
      issues.add({
        code: "OVERPAID",
        sheet: allocationSheet?.name ?? paymentSheet?.name,
        value: `${plan.lots[c.lot].code} · ${plan.cycles[c.cycle].name}`,
      });
    }
  }

  /* Expenses. */
  for (const row of expenseSheet?.rows ?? []) {
    const cycle = billedCycleOf(row, "cycle");
    const date = row.date("date", { required: true });
    const label = row.text("label", { required: true });
    const amountMillimes = row.money("amount", { required: true, positive: true });
    if (cycle === undefined || !date || !label || amountMillimes === null) continue;
    plan.expenses.push({ cycle, date, label, reference: row.text("reference") || null, amountMillimes });
  }

  /*
   * Starting balances: carried from the cycle before when the file says so —
   * or, when it does not say, when the typed one is that cycle's closing balance.
   */
  const income = new Map<number, number>();
  for (const p of plan.payments) {
    for (const a of p.allocations) {
      const cycle = plan.charges[a.charge].cycle;
      income.set(cycle, (income.get(cycle) ?? 0) + a.amountMillimes);
    }
  }
  const spent = new Map<number, number>();
  for (const e of plan.expenses) spent.set(e.cycle, (spent.get(e.cycle) ?? 0) + e.amountMillimes);
  let previousClosing: number | null = null;
  cycleRows.forEach(({ cycle, carried, opening }, i) => {
    const billed = cycle.status !== "DRAFT";
    const previousBilled = i > 0 && plan.cycles[i - 1].status !== "DRAFT";
    cycle.carried =
      billed && previousBilled && previousClosing !== null && (carried ?? (opening === null || opening === previousClosing));
    cycle.openingMillimes = cycle.carried ? previousClosing! : (opening ?? 0);
    previousClosing = billed ? cycle.openingMillimes + (income.get(i) ?? 0) - (spent.get(i) ?? 0) : null;
  });

  return issues.any ? { ok: false, issues: issues.list } : { ok: true, plan };
}

/* ---------- Writing the plan ---------- */

export interface ImportCounts {
  blocs: number;
  lots: number;
  owners: number;
  cycles: number;
  payments: number;
  expenses: number;
}

/**
 * Writes a checked plan as a new residence owned by `userId`, all or nothing.
 * `name` overrides the file's residence name.
 */
export async function writeImportPlan(
  userId: string,
  plan: ImportPlan,
  { name }: { name?: string } = {},
): Promise<{ residence: Residence; counts: ImportCounts }> {
  const db = await getDb();
  const actor = new ObjectId(userId);
  const residence = await withTransaction(async (session) => {
    const created = await residencesRepo.insertResidence(
      { name: name?.trim() || plan.residence.name, city: plan.residence.city, currency: plan.residence.currency },
      userId,
      session,
    );
    await membershipsRepo.insertMembership({ userId, residenceId: created.id, role: "SYNDIC_ADMIN" }, session);
    const organizationId = new ObjectId(created.id);
    const now = newTimestamps();
    const insert = async (collection: string, docs: object[]) => {
      if (docs.length) await db.collection(collection).insertMany(docs, { session });
    };

    const blocIds = plan.blocs.map(() => new ObjectId());
    await insert(
      COLLECTIONS.buildings,
      plan.blocs.map((name, i) => ({ _id: blocIds[i], organizationId, name, ...now })),
    );

    const ownerIds = plan.owners.map(() => new ObjectId());
    await insert(
      COLLECTIONS.owners,
      plan.owners.map((o, i) => ({
        _id: ownerIds[i],
        organizationId,
        name: o.name,
        phone: o.phone,
        ...(o.removed ? { removedAt: now.createdAt } : {}),
        ...now,
      })),
    );

    const lotIds = plan.lots.map(() => new ObjectId());
    await insert(
      COLLECTIONS.lots,
      plan.lots.map((l, i) => ({
        _id: lotIds[i],
        organizationId,
        buildingId: l.bloc === null ? null : blocIds[l.bloc],
        ownerIds: l.owners.map((o) => ownerIds[o]),
        code: l.code,
        chargeMillimes: l.chargeMillimes,
        status: "ACTIVE",
        ...now,
      })),
    );

    // Each cycle's income and spending, for the closing balance a closed cycle records.
    const income = plan.cycles.map(() => 0);
    const paid = plan.charges.map(() => 0);
    for (const p of plan.payments) {
      for (const a of p.allocations) {
        paid[a.charge] += a.amountMillimes;
        income[plan.charges[a.charge].cycle] += a.amountMillimes;
      }
    }
    const spent = plan.cycles.map(() => 0);
    for (const e of plan.expenses) spent[e.cycle] += e.amountMillimes;

    const cycleIds = plan.cycles.map(() => new ObjectId());
    await insert(
      COLLECTIONS.cycles,
      plan.cycles.map((c, i) => {
        const billed = c.status !== "DRAFT";
        const closed = c.status === "CLOSED";
        return {
          _id: cycleIds[i],
          organizationId,
          name: c.name,
          startDate: c.start,
          endDate: c.end,
          status: c.status,
          openedAt: billed ? c.start : null,
          closedAt: closed ? c.end : null,
          createdBy: actor,
          closedBy: closed ? actor : null,
          openingTreasuryBalanceMillimes: billed ? c.openingMillimes : null,
          ...(billed ? { openingSource: c.carried ? "CARRIED" : "MANUAL" } : {}),
          closingTreasuryBalanceMillimes: closed ? c.openingMillimes + income[i] - spent[i] : null,
          previousCycleId: i > 0 ? cycleIds[i - 1] : null,
          nextCycleId: i < plan.cycles.length - 1 ? cycleIds[i + 1] : null,
        };
      }),
    );

    const chargeIds = plan.charges.map(() => new ObjectId());
    await insert(
      COLLECTIONS.assessments,
      plan.charges.map((c, i) => ({
        _id: chargeIds[i],
        organizationId,
        cycleId: cycleIds[c.cycle],
        lotId: lotIds[c.lot],
        ownerIds: c.owners.map((o) => ownerIds[o]),
        amountMillimes: c.amountMillimes,
        calculationMethod: c.amountMillimes === plan.lots[c.lot].chargeMillimes ? "FIXED" : "MANUAL",
        dueDate: plan.cycles[c.cycle].start,
        status: c.cancelled
          ? "CANCELLED"
          : paid[i] <= 0
            ? "PENDING"
            : paid[i] >= c.amountMillimes
              ? "PAID"
              : "PARTIALLY_PAID",
        paidMillimes: paid[i],
      })),
    );

    await insert(
      COLLECTIONS.payments,
      plan.payments.map((p) => ({
        _id: new ObjectId(),
        organizationId,
        ownerId: p.owner === null ? null : ownerIds[p.owner],
        payerName: p.payer,
        date: p.date,
        amountMillimes: p.allocations.reduce((n, a) => n + a.amountMillimes, 0),
        method: p.method,
        note: p.note,
        status: "COMPLETED",
        cancelledReason: null,
        idempotencyKey: randomUUID(),
        allocations: p.allocations.map((a) => ({
          assessmentId: chargeIds[a.charge],
          lotId: lotIds[plan.charges[a.charge].lot],
          cycleId: cycleIds[plan.charges[a.charge].cycle],
          amountMillimes: a.amountMillimes,
        })),
        createdBy: actor,
      })),
    );

    await insert(
      COLLECTIONS.expenses,
      plan.expenses.map((e) => ({
        _id: new ObjectId(),
        organizationId,
        cycleId: cycleIds[e.cycle],
        label: e.label,
        amountMillimes: e.amountMillimes,
        reference: e.reference,
        date: e.date,
        status: "RECORDED",
        cancelledReason: null,
        idempotencyKey: randomUUID(),
        createdBy: actor,
      })),
    );

    await writeAuditLog(
      {
        organizationId: created.id,
        actorUserId: userId,
        action: "RESIDENCE_IMPORTED",
        entityType: "residence",
        entityId: created.id,
        metadata: { name: created.name },
      },
      session,
    );
    return created;
  });

  return {
    residence,
    counts: {
      blocs: plan.blocs.length,
      lots: plan.lots.length,
      owners: plan.owners.length,
      cycles: plan.cycles.length,
      payments: plan.payments.length,
      expenses: plan.expenses.length,
    },
  };
}

export type ImportResult =
  | { ok: true; residence: Residence; counts: ImportCounts }
  | { ok: false; issues: ImportIssue[] };

/** Checks the file, then writes it as a new residence — or reports why not, writing nothing. */
export async function importResidence(
  userId: string,
  file: Buffer | ArrayBuffer,
  options: { name?: string } = {},
): Promise<ImportResult> {
  const parsed = await parseResidenceWorkbook(file);
  if (!parsed.ok) return parsed;
  return { ok: true, ...(await writeImportPlan(userId, parsed.plan, options)) };
}
