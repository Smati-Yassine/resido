import ExcelJS from "exceljs";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { CurrencyCode } from "@/lib/currency";
import { formatMonth } from "@/lib/format";
import type { PrintData } from "@/lib/print/load";
import type { ExportDoc } from "./docs";
import { addSummary, addTable, col, label, stamp, units, type Cell } from "./sheets";
import { addReportSheets, REPORT_PARTS } from "./report-sheets";

/**
 * The cycle's Excel exports (docs/09-excel-exports.md), from the same data as
 * the PDFs (lib/print/load.ts). One workbook per document:
 * - property, payments, expenses, report — the printed documents themselves,
 *   laid out as the PDF (lib/export/report-sheets.ts);
 * - unpaid — the lots still owing, most owed first, to sort and filter;
 * - finances — the treasury: summary, month by month, every movement with
 *   its running balance.
 */
export { EXPORT_DOCS, type ExportDoc } from "./docs";

export interface ExportCtx {
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
  residence: { name: string; city: string };
  cycle: { name: string; status: "DRAFT" | "OPEN" | "CLOSED"; range: string };
  /** The document's name, first line of every sheet. */
  title: string;
}

type Sheet = "summary" | "unpaid" | "flows" | "movements";

const SHEETS: Record<"unpaid" | "finances", Sheet[]> = {
  unpaid: ["unpaid"],
  finances: ["summary", "flows", "movements"],
};

const NAMES: Record<Sheet, Record<Locale, string>> = {
  summary: { fr: "Synthèse", en: "Summary" },
  unpaid: { fr: "Impayés", en: "Unpaid" },
  flows: { fr: "Par mois", en: "By month" },
  movements: { fr: "Mouvements", en: "Movements" },
};

const LOT_COLS = [
  col("Bloc", "Block", 16),
  col("Lot", "Unit", 14),
  col("Propriétaire(s)", "Owner(s)", 28),
  col("Téléphone(s)", "Phone(s)", 22),
  col("Charge", "Charge", 14, "money"),
  col("Payé", "Paid", 14, "money"),
  col("Reste", "Left to pay", 14, "money"),
  col("Statut", "Status", 12),
];

export async function buildCycleWorkbook(ctx: ExportCtx, data: PrintData, doc: ExportDoc): Promise<Buffer> {
  const { locale, currency } = ctx;
  const fr = locale === "fr";
  const word = (code: string | null) => (code ? label(code, locale) : "");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Résido";
  workbook.created = new Date();
  if (doc !== "unpaid" && doc !== "finances") {
    addReportSheets(workbook, { ...ctx, generatedOn: stamp(locale) }, data, REPORT_PARTS[doc]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  const caption = [
    `${ctx.residence.name} — ${ctx.title}`,
    `${ctx.cycle.name} · ${ctx.cycle.range}`,
    `${fr ? "Généré le" : "Generated on"} ${stamp(locale)} · Résido`,
  ];
  const table = (sheet: Sheet, columns: typeof LOT_COLS, rows: Cell[][], total?: number[]) =>
    addTable(workbook, { name: NAMES[sheet][locale], caption, columns, rows, currency, locale, total });

  const lots = data.byBloc.flatMap((b) => b.lots.map((l) => ({ ...l, bloc: b.name })));
  const lotRow = (l: (typeof lots)[number]): Cell[] => [
    l.bloc,
    l.code,
    l.owners,
    l.phones,
    units(l.chargeMillimes),
    units(l.paidMillimes),
    units(l.chargeMillimes - l.paidMillimes),
    word(l.status),
  ];

  // The treasury, one movement at a time, oldest first, each with the balance after it.
  const movements = [
    ...data.payments.map((p) => ({
      date: p.date,
      kind: fr ? "Encaissement" : "Payment",
      what: p.lots,
      detail: [p.payer, word(p.method), p.note].filter(Boolean).join(" · "),
      inMillimes: p.amountMillimes,
      outMillimes: 0,
    })),
    ...data.expenseMonths.flatMap((m) =>
      m.items.map((e) => ({
        date: e.date,
        kind: fr ? "Dépense" : "Expense",
        what: e.label,
        detail: e.reference ?? "",
        inMillimes: 0,
        outMillimes: e.amountMillimes,
      })),
    ),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const sheet of SHEETS[doc]) {
    switch (sheet) {
      case "summary": {
        const { treasury, totals } = data;
        addSummary(workbook, {
          name: NAMES.summary[locale],
          caption,
          currency,
          lines: [
            { label: fr ? "Solde de départ" : "Starting balance", value: units(treasury.openingBalanceMillimes), kind: "money" },
            { label: fr ? "+ Encaissements" : "+ Payments", value: units(treasury.incomeMillimes), kind: "money" },
            { label: fr ? "− Dépenses" : "− Expenses", value: units(treasury.expenseMillimes), kind: "money" },
            {
              label: fr ? "= Solde" : "= Balance",
              value: units(treasury.closingBalanceMillimes),
              kind: "money",
              strong: true,
            },
            { label: "", value: null },
            { label: fr ? "Charges appelées" : "Charges billed", value: units(totals.expectedMillimes), kind: "money" },
            { label: fr ? "Encaissé" : "Collected", value: units(totals.collectedMillimes), kind: "money" },
            { label: fr ? "Reste à encaisser" : "Left to collect", value: units(totals.outstandingMillimes), kind: "money" },
            {
              label: fr ? "Taux de recouvrement" : "Collection rate",
              value: totals.expectedMillimes ? totals.collectedMillimes / totals.expectedMillimes : 0,
              kind: "percent",
              strong: true,
            },
            { label: "", value: null },
            { label: fr ? "Lots" : "Units", value: totals.lotCount },
            { label: fr ? "Payés" : "Paid", value: totals.paid },
            { label: fr ? "Partiels" : "Partly paid", value: totals.partial },
            { label: fr ? "Impayés" : "Unpaid", value: totals.unpaid },
          ],
        });
        break;
      }
      case "unpaid":
        table(
          "unpaid",
          LOT_COLS,
          lots
            .filter((l) => l.status === "PARTIAL" || l.status === "UNPAID")
            .sort((a, b) => b.chargeMillimes - b.paidMillimes - (a.chargeMillimes - a.paidMillimes))
            .map(lotRow),
          [4, 5, 6],
        );
        break;
      case "flows":
        table(
          "flows",
          [
            col("Mois", "Month", 18),
            col("Encaissé", "Collected", 16, "money"),
            col("Dépensé", "Spent", 16, "money"),
            col("Solde en fin de mois", "Balance at month end", 20, "money"),
          ],
          data.flows.map((f) => [
            formatMonth(f.month, locale),
            units(f.incomeMillimes),
            units(f.expenseMillimes),
            units(f.balanceMillimes),
          ]),
          [1, 2],
        );
        break;
      case "movements": {
        let balance = data.treasury.openingBalanceMillimes;
        table(
          "movements",
          [
            col("Date", "Date", 12, "date"),
            col("Type", "Type", 14),
            col("Libellé", "Description", 30),
            col("Détail", "Detail", 34),
            col("Entrée", "In", 14, "money"),
            col("Sortie", "Out", 14, "money"),
            col("Solde", "Balance", 16, "money"),
          ],
          [
            [null, fr ? "Solde de départ" : "Starting balance", "", "", null, null, units(balance)],
            ...movements.map((m) => {
              balance += m.inMillimes - m.outMillimes;
              return [
                m.date,
                m.kind,
                m.what,
                m.detail,
                m.inMillimes ? units(m.inMillimes) : null,
                m.outMillimes ? units(m.outMillimes) : null,
                units(balance),
              ];
            }),
          ],
          [4, 5],
        );
        break;
      }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
