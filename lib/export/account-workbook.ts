import ExcelJS from "exceljs";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Residence } from "@/lib/domain/residences/schema";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as paymentsRepo from "@/lib/domain/payments/repository";
import * as expensesRepo from "@/lib/domain/expenses/repository";
import { computeCycleTreasury } from "@/lib/domain/cycles/service";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";

/**
 * "Export my data": one workbook covering the chosen residences, one sheet
 * per kind of record, each row tagged with its residence. Built from the
 * same repositories the app reads (docs/09-excel-exports.md). Money cells are
 * numbers in dinars with 3 decimals; dates are real Excel dates.
 */

type Col = { header: Record<Locale, string>; width: number; kind?: "money" | "date" };
type Row = (string | number | Date | null)[];

/** Excel number format with the residence currency's decimals: "#,##0.000" (TND), "#,##0.00" (EUR…). */
const moneyFormat = (currency: CurrencyCode) => `#,##0.${"0".repeat(CURRENCIES[currency].decimals)}`;
const DATE_FORMAT = "dd/mm/yyyy";
const dt = (millimes: number) => millimes / 1000;

const SHEETS = {
  residences: { fr: "Résidences", en: "Residences" },
  blocs: { fr: "Blocs", en: "Blocks" },
  lots: { fr: "Lots", en: "Units" },
  owners: { fr: "Propriétaires", en: "Owners" },
  cycles: { fr: "Cycles", en: "Cycles" },
  charges: { fr: "Charges", en: "Charges" },
  payments: { fr: "Paiements", en: "Payments" },
  expenses: { fr: "Dépenses", en: "Expenses" },
} as const;

const c = (fr: string, en: string, width: number, kind?: Col["kind"]): Col => ({ header: { fr, en }, width, kind });
const RES = c("Résidence", "Residence", 24);
const CYCLE = c("Cycle", "Cycle", 16);

const COLUMNS: Record<keyof typeof SHEETS, Col[]> = {
  residences: [
    c("Nom", "Name", 28),
    c("Ville", "City", 18),
    c("Devise", "Currency", 10),
    c("Statut", "Status", 12),
    c("Créée le", "Created", 14, "date"),
  ],
  blocs: [RES, c("Bloc", "Block", 18)],
  lots: [
    RES,
    c("Lot", "Unit", 14),
    c("Bloc", "Block", 14),
    c("Propriétaire", "Owner", 24),
    c("Charge annuelle", "Annual charge", 16, "money"),
  ],
  owners: [RES, c("Nom", "Name", 24), c("Téléphone", "Phone", 18), c("Lots", "Units", 40)],
  cycles: [
    RES,
    CYCLE,
    c("Statut", "Status", 12),
    c("Début", "Start", 12, "date"),
    c("Fin", "End", 12, "date"),
    c("Solde de départ", "Starting balance", 16, "money"),
    c("Encaissé", "Collected", 16, "money"),
    c("Dépenses", "Expenses", 16, "money"),
    c("Solde de fin", "End balance", 16, "money"),
  ],
  charges: [
    RES,
    CYCLE,
    c("Lot", "Unit", 14),
    c("Charge", "Charge", 14, "money"),
    c("Payé", "Paid", 14, "money"),
    c("Reste", "Remaining", 14, "money"),
    c("Statut", "Status", 14),
  ],
  payments: [
    RES,
    CYCLE,
    c("Date", "Date", 12, "date"),
    c("Lots", "Units", 30),
    c("Payeur", "Payer", 22),
    c("Mode", "Method", 14),
    c("Note", "Note", 30),
    c("Montant", "Amount", 14, "money"),
  ],
  expenses: [
    RES,
    CYCLE,
    c("Date", "Date", 12, "date"),
    c("Libellé", "Description", 32),
    c("Référence", "Reference", 22),
    c("Montant", "Amount", 14, "money"),
  ],
};

const LABELS: Record<string, Record<Locale, string>> = {
  ACTIVE: { fr: "Active", en: "Active" },
  ARCHIVED: { fr: "Archivée", en: "Archived" },
  DRAFT: { fr: "En préparation", en: "In preparation" },
  OPEN: { fr: "En cours", en: "In progress" },
  CLOSED: { fr: "Clôturé", en: "Closed" },
  PENDING: { fr: "Impayé", en: "Unpaid" },
  PARTIALLY_PAID: { fr: "Partiel", en: "Partial" },
  PAID: { fr: "Payé", en: "Paid" },
  CANCELLED: { fr: "Annulé", en: "Cancelled" },
  CASH: { fr: "Espèces", en: "Cash" },
  BANK_TRANSFER: { fr: "Virement", en: "Bank transfer" },
  CHECK: { fr: "Chèque", en: "Cheque" },
};

export async function buildAccountWorkbook(residences: Residence[], locale: Locale): Promise<Buffer> {
  const label = (code: string) => LABELS[code]?.[locale] ?? code;
  // Each row remembers its residence's currency, so money cells get the right decimals.
  const rows: Record<keyof typeof SHEETS, { values: Row; currency: CurrencyCode }[]> = {
    residences: [],
    blocs: [],
    lots: [],
    owners: [],
    cycles: [],
    charges: [],
    payments: [],
    expenses: [],
  };

  for (const residence of residences) {
    const id = residence.id;
    const [blocs, lots, owners, cycles] = await Promise.all([
      buildingsRepo.listBuildings(id),
      lotsRepo.listLots(id),
      ownersRepo.listOwners(id),
      cyclesRepo.listCycles(id),
    ]);
    const blocName = new Map(blocs.map((b) => [b.id, b.name]));
    const ownerName = new Map(owners.map((o) => [o.id, o.name]));
    const lotCode = new Map(lots.map((l) => [l.id, l.code]));
    const r = residence.name;
    const cur = residence.currency;
    const push = (sheet: keyof typeof SHEETS, values: Row) => rows[sheet].push({ values, currency: cur });

    push("residences", [r, residence.city, cur, label(residence.status), residence.createdAt]);
    for (const b of blocs) push("blocs", [r, b.name]);
    for (const l of lots) {
      push("lots", [
        r,
        l.code,
        l.buildingId ? (blocName.get(l.buildingId) ?? "") : "",
        l.ownerIds.map((id) => ownerName.get(id) ?? "").filter(Boolean).join(" & "),
        dt(l.chargeMillimes),
      ]);
    }
    for (const o of owners) {
      const held = lots.filter((l) => l.ownerIds.includes(o.id)).map((l) => l.code);
      push("owners", [r, o.name, o.phone ?? "", held.join(", ")]);
    }

    // Oldest cycle first, like the source ledgers.
    for (const cycle of [...cycles].reverse()) {
      const [treasury, assessments, payments, expenses] = await Promise.all([
        computeCycleTreasury(id, cycle),
        assessmentsRepo.listAssessmentsForCycle(id, cycle.id),
        paymentsRepo.listPaymentsForCycle(id, cycle.id),
        expensesRepo.listExpensesForCycle(id, cycle.id),
      ]);
      const billed = cycle.status !== "DRAFT";
      push("cycles", [
        r,
        cycle.name,
        label(cycle.status),
        cycle.startDate,
        cycle.endDate,
        billed ? dt(treasury.openingBalanceMillimes) : null,
        billed ? dt(treasury.incomeMillimes) : null,
        billed ? dt(treasury.expenseMillimes) : null,
        billed ? dt(treasury.closingBalanceMillimes) : null,
      ]);
      for (const a of assessments) {
        push("charges", [
          r,
          cycle.name,
          lotCode.get(a.lotId) ?? "",
          dt(a.amountMillimes),
          dt(a.paidMillimes),
          dt(a.amountMillimes - a.paidMillimes),
          label(a.status),
        ]);
      }
      for (const p of [...payments].reverse()) {
        push("payments", [
          r,
          cycle.name,
          p.date,
          p.allocations.map((a) => lotCode.get(a.lotId) ?? "").join(", "),
          p.payerName ?? "",
          label(p.method),
          p.note ?? "",
          dt(p.amountMillimes),
        ]);
      }
      for (const e of expenses) {
        push("expenses", [r, cycle.name, e.date, e.label, e.reference ?? "", dt(e.amountMillimes)]);
      }
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Résido";
  workbook.created = new Date();
  const stamp = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date());
  const scope = residences.map((x) => x.name).join(", ");

  for (const key of Object.keys(SHEETS) as (keyof typeof SHEETS)[]) {
    const columns = COLUMNS[key];
    const sheet = workbook.addWorksheet(SHEETS[key][locale], { views: [{ state: "frozen", ySplit: 2 }] });
    sheet.columns = columns.map((col) => ({ width: col.width }));
    // Row 1 makes the file self-describing: when it was made and what it covers.
    const title = sheet.addRow([`Résido — ${locale === "fr" ? "export du" : "export of"} ${stamp} — ${scope}`]);
    title.font = { italic: true, color: { argb: "FF5E6470" } };
    const header = sheet.addRow(columns.map((col) => col.header[locale]));
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEE8DE" } };
    for (const { values, currency } of rows[key]) {
      const row = sheet.addRow(values);
      columns.forEach((col, i) => {
        if (col.kind === "money") row.getCell(i + 1).numFmt = moneyFormat(currency);
        if (col.kind === "date") row.getCell(i + 1).numFmt = DATE_FORMAT;
      });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
