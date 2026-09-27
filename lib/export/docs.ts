/**
 * The cycle's Excel exports, by the name in their URL (/export/<doc>) —
 * apart from the workbook builder so a page can list them without loading it.
 */
export const EXPORT_DOCS = ["property", "payments", "expenses", "unpaid", "finances", "report"] as const;
export type ExportDoc = (typeof EXPORT_DOCS)[number];

/** /export/all: not one cycle but the whole residence, every cycle (lib/export/residence-workbook.ts). */
export const RESIDENCE_EXPORT = "all";
export type ExportTarget = ExportDoc | typeof RESIDENCE_EXPORT;

/** Each export's URL for the cycle on screen, from a page's `href` (which keeps `?cycle=`). */
export const exportHrefs = (href: (path: string) => string) =>
  Object.fromEntries(
    [...EXPORT_DOCS, RESIDENCE_EXPORT].map((doc) => [doc, href(`/export/${doc}`)]),
  ) as Record<ExportTarget, string>;
