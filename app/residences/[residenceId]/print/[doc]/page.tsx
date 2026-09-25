import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { cycleRange } from "@/lib/cycle-view";
import { loadPrintData } from "@/lib/print/load";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import {
  DocHeader,
  ExpensesSheet,
  KeyFigures,
  PaymentsSheet,
  PropertySheet,
  SectionTitle,
  TreasuryStrip,
} from "@/components/print/Documents";

const DOCS = ["property", "payments", "expenses", "finances", "report"] as const;
type Doc = (typeof DOCS)[number];

/**
 * A printable document of the cycle on screen, outside the app's shell:
 * /print/property (lots by bloc, the ledger), /print/payments,
 * /print/expenses, /print/finances (treasury + both lists) and /print/report
 * (all of it). Opens the print dialog by itself.
 */
export default async function PrintPage({ params, searchParams }: PageProps<"/residences/[residenceId]/print/[doc]">) {
  const { doc } = await params;
  if (!DOCS.includes(doc as Doc)) notFound();
  const { session, residenceId, residence, cycle, currency } = await loadWorkspace(params, searchParams);
  if (!cycle) notFound();
  const { t, locale } = await getDictionary();
  const data = await loadPrintData(session, residenceId, cycle);
  const ctx = { t, locale, currency };
  const billed = cycle.status !== "DRAFT";
  const closed = cycle.status === "CLOSED";

  const titles: Record<Doc, string> = {
    property: t.docProperty,
    payments: t.docPayments,
    expenses: t.docExpenses,
    finances: t.docFinances,
    report: t.docReport,
  };
  // Every sheet starts a new page with the same header; the property ledger is landscape.
  const sheet = (key: string, title: string, body: React.ReactNode, landscape = false) => (
    <section key={key} className={`print-sheet ${landscape ? "print-landscape" : ""}`}>
      <DocHeader ctx={ctx} title={title} residence={residence} cycleLine={`${cycle.name} · ${cycleRange(cycle, t)}`} />
      {body}
    </section>
  );

  const property = (title: string) =>
    sheet("property", title, <PropertySheet ctx={ctx} data={data} billed={billed} />, true);
  const paymentsSheet = (title: string) =>
    sheet("payments", title, <PaymentsSheet ctx={ctx} payments={data.payments} />);
  const expensesSheet = (title: string) =>
    sheet("expenses", title, <ExpensesSheet ctx={ctx} months={data.expenseMonths} />);
  const treasury = (
    <>
      <SectionTitle>{t.treasurySummary}</SectionTitle>
      <TreasuryStrip ctx={ctx} data={data} closed={closed} />
    </>
  );

  const sheets: Record<Doc, () => React.ReactNode[]> = {
    property: () => [property(t.docProperty)],
    payments: () => [paymentsSheet(t.docPayments)],
    expenses: () => [expensesSheet(t.docExpenses)],
    finances: () => [
      sheet(
        "summary",
        t.docFinances,
        <>
          {treasury}
          <SectionTitle>{t.docPayments}</SectionTitle>
          <PaymentsSheet ctx={ctx} payments={data.payments} />
        </>,
      ),
      expensesSheet(`${t.docFinances} · ${t.docExpenses}`),
    ],
    report: () => [
      sheet(
        "summary",
        t.docReport,
        <>
          <SectionTitle>{t.keyFigures}</SectionTitle>
          <KeyFigures ctx={ctx} data={data} />
          {treasury}
        </>,
      ),
      property(`${t.docReport} · ${t.docProperty}`),
      paymentsSheet(`${t.docReport} · ${t.docPayments}`),
      expensesSheet(`${t.docReport} · ${t.docExpenses}`),
    ],
  };

  return (
    <div className="print-doc">
      <title>{`${titles[doc as Doc]} — ${residence.name} — ${cycle.name}`}</title>
      <PrintToolbar />
      {sheets[doc as Doc]()}
    </div>
  );
}
