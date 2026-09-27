import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import type { ImportIssue } from "./residence-import";

/** One import problem as a sentence: where it is in the file, then what is wrong. */
export function describeImportIssue(issue: ImportIssue, t: Dictionary, locale: Locale): string {
  const problem = interpolate(t[`importErr${issue.code}`], {
    column: issue.column ?? "",
    value: issue.value ?? "",
    expected: issue.expected?.[locale] ?? "",
  });
  const where = issue.sheet
    ? interpolate(issue.row ? t.importWhere : t.importWhereSheet, { sheet: issue.sheet, row: issue.row ?? "" })
    : "";
  const text = `${where}${problem}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What POST /api/imports/residence answers. */
export type ImportResponse =
  | { ok: true; message: string; slug: string }
  | { ok: false; message: string; issues: string[] };
