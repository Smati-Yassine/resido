# ADR-010: exceljs for server-generated Excel exports (import revised 2026-09)

## Context

§21 of the brief requires exporting lots, owners, payments, unpaid balances,
expenses, treasury, and cycle reports to `.xlsx`, generated from the
normalized MongoDB data. §22 explicitly forbids building any Excel import/
migration/reconciliation capability — Excel is a one-way output.

## Decision

- Use **`exceljs`** to generate `.xlsx` files server-side (Route Handlers),
  with styling (number formats, headers) matching the money/date
  conventions used elsewhere in the app.
- Small/bounded exports generate synchronously in the request; large exports
  go through the background `jobs` mechanism (§05/§09).
- No Excel parsing/reading library is added to the dependency tree at all —
  there is no code path in Résido that reads an `.xlsx` file as input.

## Alternatives considered

- **`xlsx` (SheetJS) community edition** — capable of both read and write,
  but read capability is unwanted here (a library that *can* import Excel
  invites scope creep toward the explicitly-forbidden import feature) and
  its streaming/write-styling ergonomics are weaker than `exceljs` for a
  professional financial export with number formats and headers.
- **CSV-only export** — simpler, but does not match the business's existing
  Excel-based workflow/expectations (§1 of the brief: the target artifact is
  Excel, not CSV) and loses formatting (money number format, multi-sheet
  cycle reports) that `.xlsx` supports and CSV cannot.
- **Client-side Excel generation** — rejected: money/report data must be
  computed from the authoritative server-side domain layer (§45 of the
  brief — the database is the source of truth, never client state), and
  large reports would block the browser; server-side generation (optionally
  backgrounded) is the only sound approach.

## Consequences

- Export code depends only on the same domain read functions/aggregations
  the UI uses — there is exactly one place per entity type that knows how
  to compute "unpaid balances" or "cycle totals," used by both the
  dashboard and the export, preventing the two from ever disagreeing.
- Because no import path exists, there is no risk of Excel becoming a
  disguised secondary source of truth or reintroducing the
  spreadsheet-driven architecture the brief explicitly rejects (§46).

## Revision (2026-09): importing a whole residence

The product owner asked for import: moving a residence between accounts,
restoring one from its export, and starting from a prepared workbook.
`exceljs` already reads `.xlsx`, so no library is added. The import is
bounded so the concerns above still hold:

- It reads only the "whole residence" workbook (`lib/export/residence-format.ts`,
  one definition for export and import) and **only ever creates a new
  residence** — Excel never overwrites, merges into or becomes the source of
  truth for an existing one.
- Everything the app computes (paid amounts, statuses, payment totals,
  closing balances) is recomputed from the imported records, never read
  from the file.
- The whole file is validated before any write; a file with problems
  imports nothing, and every write happens in one transaction.

See docs/09-excel-exports.md#import.
