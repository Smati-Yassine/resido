import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { cycleRange } from "@/lib/cycle-view";
import { slugify } from "@/lib/text";
import { loadPrintData } from "@/lib/print/load";
import { buildCycleWorkbook, EXPORT_DOCS, type ExportDoc } from "@/lib/export/cycle-workbook";

/**
 * An Excel export of the cycle on screen, as an .xlsx download:
 * /export/property, /export/payments, /export/expenses, /export/unpaid,
 * /export/finances and /export/report, with `?cycle=` like every residence
 * page. The same data as the printed documents, the same access rules.
 */
export async function GET(request: Request, ctx: RouteContext<"/residences/[residenceId]/export/[doc]">) {
  const { doc } = await ctx.params;
  if (!EXPORT_DOCS.includes(doc as ExportDoc)) notFound();
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { session, residenceId, residence, cycle, cycles, currency } = await loadWorkspace(
    ctx.params,
    Promise.resolve(query),
  );
  if (!cycle) notFound();
  const { t, locale } = await getDictionary();
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
    { locale, currency, residence: residence.name, cycle: { name: cycle.name, range: cycleRange(cycle, t) }, title },
    data,
    doc as ExportDoc,
  );
  const name = slugify(`${title} ${residence.name} ${cycle.name}`, "export");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
