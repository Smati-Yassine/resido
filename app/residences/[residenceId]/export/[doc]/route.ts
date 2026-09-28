import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { cycleRange } from "@/lib/cycle-view";
import { slugify } from "@/lib/text";
import { loadPrintData } from "@/lib/print/load";
import { buildCycleWorkbook, EXPORT_DOCS, type ExportDoc } from "@/lib/export/cycle-workbook";
import { buildResidenceWorkbook } from "@/lib/export/residence-workbook";
import { RESIDENCE_EXPORT } from "@/lib/export/docs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const workbookResponse = (bytes: Buffer, name: string) =>
  new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });

/**
 * An Excel export of the cycle on screen, as an .xlsx download:
 * /export/property, /export/payments, /export/expenses, /export/unpaid,
 * /export/finances and /export/report, with `?cycle=` like every residence
 * page. The same data as the printed documents, the same access rules.
 * /export/all is the whole residence instead, every cycle — the file an
 * import reads back (lib/export/residence-workbook.ts).
 */
export async function GET(request: Request, ctx: RouteContext<"/residences/[residenceId]/export/[doc]">) {
  const { doc } = await ctx.params;
  if (!EXPORT_DOCS.includes(doc as ExportDoc) && doc !== RESIDENCE_EXPORT) notFound();
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { session, residenceId, residence, cycle, cycles, currency } = await loadWorkspace(
    ctx.params,
    Promise.resolve(query),
  );
  const { t, locale } = await getDictionary();
  if (doc === RESIDENCE_EXPORT) {
    const date = new Date().toISOString().slice(0, 10);
    const bytes = await buildResidenceWorkbook(session, residence, t, locale);
    return workbookResponse(bytes, slugify(`${residence.name} ${date}`, "residence"));
  }
  if (!cycle) notFound();
  const previous = cycles.find((c) => c.id === cycle.previousCycleId) ?? null;
  const data = await loadPrintData(session, residenceId, cycle, previous);
  const title = {
    property: t.docProperty,
    payments: t.docPayments,
    expenses: t.docExpenses,
    unpaid: t.docUnpaid,
    finances: t.docFinances,
    report: t.docReport,
  }[doc as ExportDoc];
  const bytes = await buildCycleWorkbook(
    {
      t,
      locale,
      currency,
      residence: { name: residence.name, city: residence.city },
      cycle: { name: cycle.name, status: cycle.status, range: cycleRange(cycle, t) },
      title,
    },
    data,
    doc as ExportDoc,
  );
  return workbookResponse(bytes, slugify(`${title} ${residence.name} ${cycle.name}`, "export"));
}
