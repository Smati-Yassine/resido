import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { PrintData } from "@/lib/print/load";
import { FinanceCover, ReportCover } from "./cover";
import type { PdfCtx } from "./parts";
import { ExpensesPages, PaymentsPages, PropertyPages } from "./sheets";

export const PRINT_DOCS = ["property", "payments", "expenses", "finances", "report"] as const;
export type PrintDoc = (typeof PRINT_DOCS)[number];

export function docTitle(ctx: PdfCtx, doc: PrintDoc) {
  const { t } = ctx;
  return {
    property: t.docProperty,
    payments: t.docPayments,
    expenses: t.docExpenses,
    finances: t.docFinances,
    report: t.docReport,
  }[doc];
}

/**
 * One printable document as PDF bytes: the property ledger, the payments, the
 * expenses, the financial report (its cover, then both lists) or the
 * residence report (its cover, the ledger, then both lists).
 */
export function renderPrintDocument(ctx: PdfCtx, data: PrintData, doc: PrintDoc) {
  const { t } = ctx;
  const title = docTitle(ctx, doc);
  const pages = {
    property: <PropertyPages ctx={ctx} data={data} title={t.docProperty} />,
    payments: <PaymentsPages ctx={ctx} data={data} title={t.docPayments} />,
    expenses: <ExpensesPages ctx={ctx} data={data} title={t.docExpenses} />,
    finances: (
      <>
        <FinanceCover ctx={ctx} data={data} />
        <PaymentsPages ctx={ctx} data={data} title={`${t.docFinances} · ${t.docPayments}`} />
        <ExpensesPages ctx={ctx} data={data} title={`${t.docFinances} · ${t.docExpenses}`} />
      </>
    ),
    report: (
      <>
        <ReportCover ctx={ctx} data={data} />
        <PropertyPages ctx={ctx} data={data} title={`${t.docReport} · ${t.docProperty}`} />
        <PaymentsPages ctx={ctx} data={data} title={`${t.docReport} · ${t.docPayments}`} />
        <ExpensesPages ctx={ctx} data={data} title={`${t.docReport} · ${t.docExpenses}`} />
      </>
    ),
  }[doc];
  return renderToBuffer(
    <Document
      title={`${title} — ${ctx.residence.name} — ${ctx.cycle.name}`}
      author={ctx.residence.name}
      creator="Résido"
      producer="Résido"
      language={ctx.locale}
    >
      {pages}
    </Document>,
  );
}
