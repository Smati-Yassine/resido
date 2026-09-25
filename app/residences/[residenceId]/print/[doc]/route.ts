import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { cycleRange } from "@/lib/cycle-view";
import { formatDate } from "@/lib/format";
import { slugify } from "@/lib/text";
import { loadPrintData } from "@/lib/print/load";
import { docTitle, PRINT_DOCS, renderPrintDocument, type PrintDoc } from "@/lib/print/pdf/render";

/**
 * A printable document of the cycle on screen, as a PDF:
 * /print/property, /print/payments, /print/expenses, /print/finances and
 * /print/report, with `?cycle=` like every residence page. The app fetches
 * it and opens it in the browser's PDF viewer.
 */
export async function GET(request: Request, ctx: RouteContext<"/residences/[residenceId]/print/[doc]">) {
  const { doc } = await ctx.params;
  if (!PRINT_DOCS.includes(doc as PrintDoc)) notFound();
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { session, residenceId, residence, cycle, cycles, currency } = await loadWorkspace(
    ctx.params,
    Promise.resolve(query),
  );
  if (!cycle) notFound();
  const { t, locale } = await getDictionary();
  const previous = cycles.find((c) => c.id === cycle.previousCycleId) ?? null;
  const data = await loadPrintData(session, residenceId, cycle, previous);
  const pdfCtx = {
    t,
    locale,
    currency,
    residence: { name: residence.name, city: residence.city },
    cycle: { name: cycle.name, status: cycle.status, range: cycleRange(cycle, t) },
    printedOn: formatDate(new Date()),
  };
  const bytes = await renderPrintDocument(pdfCtx, data, doc as PrintDoc);
  const name = slugify(`${docTitle(pdfCtx, doc as PrintDoc)} ${residence.name} ${cycle.name}`, "document");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
