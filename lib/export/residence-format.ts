import type { Locale } from "@/lib/i18n/dictionaries";
import { fold } from "@/lib/text";
import { col, type Cell, type Col } from "./sheets";

/**
 * The residence workbook (docs/09-excel-exports.md): every cycle of a
 * residence in one file, written by lib/export/residence-workbook.ts and read
 * back by lib/import/residence-import.ts. One definition for both sides —
 * sheet names and column headers in both languages — so a file exported in
 * French imports in English and the other way round.
 *
 * Sheets marked `data` hold the records an import rebuilds the residence
 * from; the others are the views (dashboard, finances) worked out from them,
 * written for reading and ignored on import.
 */

export const RESIDENCE_FORMAT = "resido-residence";
export const RESIDENCE_FORMAT_VERSION = 1;

export const RESIDENCE_SHEETS = {
  residence: { fr: "Résidence", en: "Residence", data: true },
  cycles: { fr: "Cycles", en: "Cycles", data: true },
  blocs: { fr: "Blocs", en: "Blocks", data: true },
  lots: { fr: "Lots", en: "Units", data: true },
  owners: { fr: "Propriétaires", en: "Owners", data: true },
  charges: { fr: "Charges", en: "Charges", data: true },
  payments: { fr: "Encaissements", en: "Payments", data: true },
  allocations: { fr: "Répartition", en: "Allocations", data: true },
  expenses: { fr: "Dépenses", en: "Expenses", data: true },
  flows: { fr: "Par mois", en: "By month", data: false },
  movements: { fr: "Mouvements", en: "Movements", data: false },
  byBloc: { fr: "Par bloc", en: "By block", data: false },
  methods: { fr: "Modes de paiement", en: "Payment methods", data: false },
  members: { fr: "Membres", en: "Members", data: false },
  journal: { fr: "Journal", en: "Journal", data: false },
} as const;
export type ResidenceSheet = keyof typeof RESIDENCE_SHEETS;

/** The Résidence sheet: label / value lines. */
export const RESIDENCE_LINES = {
  name: col("Nom", "Name", 0),
  city: col("Ville", "City", 0),
  currency: col("Devise", "Currency", 0),
  status: col("Statut", "Status", 0),
  format: col("Format", "Format", 0),
} as const;

const OWNER_REFS = col("Réf. propriétaires", "Owner refs", 14);
const OWNER_NAMES = col("Propriétaire(s)", "Owner(s)", 28);

/** Each table sheet's columns, in order; the keys are what the import looks them up by. */
export const RESIDENCE_COLUMNS = {
  cycles: {
    name: col("Cycle", "Cycle", 18),
    status: col("Statut", "Status", 14),
    start: col("Début", "Start", 12, "date"),
    end: col("Fin", "End", 12, "date"),
    openingSource: col("Solde de départ repris", "Starting balance carried", 14),
    opening: col("Solde de départ", "Starting balance", 16, "money"),
    expected: col("Charges appelées", "Charges billed", 16, "money"),
    collected: col("Encaissé", "Collected", 16, "money"),
    outstanding: col("Reste à encaisser", "Left to collect", 16, "money"),
    rate: col("Taux de recouvrement", "Collection rate", 12, "percent"),
    paidLots: col("Lots payés", "Units paid", 10),
    partialLots: col("Lots partiels", "Units partly paid", 10),
    unpaidLots: col("Lots impayés", "Units unpaid", 10),
    expenses: col("Dépenses", "Expenses", 16, "money"),
    closing: col("Solde de fin", "End balance", 16, "money"),
  },
  blocs: {
    name: col("Bloc", "Block", 20),
    lots: col("Lots", "Units", 10),
    charges: col("Charges annuelles", "Annual charges", 18, "money"),
  },
  lots: {
    bloc: col("Bloc", "Block", 16),
    code: col("Lot", "Unit", 14),
    charge: col("Charge annuelle", "Annual charge", 16, "money"),
    ownerRefs: OWNER_REFS,
    owners: OWNER_NAMES,
    phones: col("Téléphone(s)", "Phone(s)", 22),
  },
  owners: {
    ref: col("Réf.", "Ref.", 8),
    name: col("Nom", "Name", 28),
    phone: col("Téléphone", "Phone", 18),
    removed: col("Retiré", "Removed", 10),
    lots: col("Lots", "Units", 30),
    lotCount: col("Nombre de lots", "Number of units", 12),
  },
  charges: {
    cycle: col("Cycle", "Cycle", 16),
    bloc: col("Bloc", "Block", 14),
    lot: col("Lot", "Unit", 12),
    ownerRefs: OWNER_REFS,
    owners: OWNER_NAMES,
    charge: col("Charge", "Charge", 14, "money"),
    paid: col("Payé", "Paid", 14, "money"),
    left: col("Reste", "Left to pay", 14, "money"),
    status: col("Statut", "Status", 12),
    methods: col("Modes de paiement", "Payment methods", 22),
  },
  payments: {
    number: col("N°", "No.", 8),
    date: col("Date", "Date", 12, "date"),
    cycles: col("Cycle(s)", "Cycle(s)", 16),
    lots: col("Lots", "Units", 24),
    payer: col("Payeur", "Payer", 24),
    payerRef: col("Réf. payeur", "Payer ref", 10),
    method: col("Mode", "Method", 14),
    note: col("Note", "Note", 30),
    amount: col("Montant", "Amount", 14, "money"),
  },
  allocations: {
    payment: col("N° encaissement", "Payment no.", 12),
    date: col("Date", "Date", 12, "date"),
    cycle: col("Cycle", "Cycle", 16),
    lot: col("Lot", "Unit", 12),
    amount: col("Montant", "Amount", 14, "money"),
  },
  expenses: {
    cycle: col("Cycle", "Cycle", 16),
    month: col("Mois", "Month", 16),
    date: col("Date", "Date", 12, "date"),
    label: col("Libellé", "Description", 34),
    reference: col("Référence", "Reference", 22),
    amount: col("Montant", "Amount", 14, "money"),
  },
  flows: {
    cycle: col("Cycle", "Cycle", 16),
    month: col("Mois", "Month", 18),
    income: col("Encaissé", "Collected", 16, "money"),
    expense: col("Dépensé", "Spent", 16, "money"),
    balance: col("Solde en fin de mois", "Balance at month end", 20, "money"),
  },
  movements: {
    cycle: col("Cycle", "Cycle", 16),
    date: col("Date", "Date", 12, "date"),
    kind: col("Type", "Type", 16),
    what: col("Libellé", "Description", 30),
    detail: col("Détail", "Detail", 34),
    in: col("Entrée", "In", 14, "money"),
    out: col("Sortie", "Out", 14, "money"),
    balance: col("Solde", "Balance", 16, "money"),
  },
  byBloc: {
    cycle: col("Cycle", "Cycle", 16),
    bloc: col("Bloc", "Block", 18),
    lots: col("Lots", "Units", 8),
    paidLots: col("Lots payés", "Units paid", 10),
    expected: col("Charges appelées", "Charges billed", 16, "money"),
    collected: col("Encaissé", "Collected", 16, "money"),
    rate: col("Taux", "Rate", 10, "percent"),
  },
  methods: {
    cycle: col("Cycle", "Cycle", 16),
    method: col("Mode", "Method", 16),
    count: col("Encaissements", "Payments", 12),
    amount: col("Montant", "Amount", 16, "money"),
  },
  members: {
    name: col("Nom", "Name", 24),
    email: col("E-mail", "Email", 30),
    role: col("Rôle", "Role", 18),
    since: col("Membre depuis", "Member since", 14, "date"),
  },
  journal: {
    date: col("Date", "Date", 18, "date"),
    who: col("Par", "By", 22),
    what: col("Action", "Action", 30),
    detail: col("Détail", "Detail", 40),
  },
} satisfies Record<Exclude<ResidenceSheet, "residence">, Record<string, Col>>;
export type TableSheet = keyof typeof RESIDENCE_COLUMNS;

/** A table's columns as the ordered list `addTable` lays out. */
export const columnList = (sheet: TableSheet): Col[] => Object.values(RESIDENCE_COLUMNS[sheet]);

/** A row given by column key, as the ordered cells of its sheet. */
export function rowOf<S extends TableSheet>(
  sheet: S,
  values: Partial<Record<keyof (typeof RESIDENCE_COLUMNS)[S], Cell | undefined>>,
): Cell[] {
  return Object.keys(RESIDENCE_COLUMNS[sheet]).map((key) => (values as Record<string, Cell | undefined>)[key] ?? null);
}

/** Header text as compared on import: no accents, case or extra spaces. */
export const headerKey = (text: string) => fold(text).replace(/\s+/g, " ").trim();

/** Whether `text` is this column's header, in either language. */
export const isHeader = (c: Col, text: string) =>
  (Object.keys(c.header) as Locale[]).some((l) => headerKey(c.header[l]) === headerKey(text));

/** "Yes" for a removed owner, in the file's language — and what the import accepts for it. */
export const YES: Record<Locale, string> = { fr: "Oui", en: "Yes" };
export const YES_WORDS = ["oui", "yes", "x", "1", "true", "vrai"];

/** Starting balance carried from the previous cycle: the same yes, or no. */
export const NO: Record<Locale, string> = { fr: "Non", en: "No" };

/** Owner refs in a cell: "P1, P4". */
export const ownerRef = (n: number) => `P${n}`;
export const splitList = (text: string) =>
  text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
