# 09 — Excel Export Strategy

Excel export is a required, one-way, read-only reporting feature. It is
**not** the internal data model (§46 of the brief) — every export is
generated on demand from normalized MongoDB data through the same domain
read functions/aggregations used by the UI.

## Library

`exceljs` (TypeScript-friendly, streaming writer, supports formatting/column
widths/number formats needed for a professional financial export) generating
`.xlsx` files server-side. Chosen over `xlsx`/`SheetJS` community edition for
better streaming write support and native styling API, and over building CSV
only, since the brief explicitly asks for Excel-formatted output matching the
business's existing spreadsheet literacy.

## Exports required (from §21 of the brief)

| Export | Source | Key columns |
|---|---|---|
| Lots | `lots` (+ current `ownerships`/`owners`) | code, building, floor, type, surface, status, current owner(s) |
| Owners | `owners` (+ `ownerships`) | name, kind, contact info, lots owned, share % |
| Payments | `payments` (+ resolved lot codes from `allocations`) | date, payer, amount, method, allocations breakdown, receipt number |
| Unpaid balances | `assessments` filtered by cycle + status ≠ PAID | lot, owner, cycle, amount due, paid, outstanding, due date |
| Expenses | `expenses` (+ category label) | date, category, payee, amount, method, reference |
| Treasury | `treasuryTransactions` (+ bank account) | date, account, type, direction, amount, running balance, source |
| Cycle reports | aggregation across `assessments`/`payments`/`expenses`/`treasuryTransactions` scoped to one cycle | summary sheet + per-domain detail sheets |

Each export is a distinct Route Handler (`app/api/exports/<name>/route.ts`)
that: validates the requester's permission + organization scope, validates
query params (date range, cycle, building, status filters — §35) with Zod,
streams the generated workbook as the response with a
`Content-Disposition: attachment` header.

## Generation strategy

- **Small/medium exports** (a single cycle's unpaid balances, one month of
  expenses) generate synchronously within the Route Handler — bounded,
  fast, no need for background processing.
- **Large exports** (full multi-year payment history, "all cycles" reports)
  are generated via the background `jobs` mechanism described in
  [05-system-architecture.md](05-system-architecture.md): the Route Handler
  enqueues a job and returns immediately; the client polls
  `GET /api/exports/jobs/:id` and downloads the resulting file (stored in
  object storage, see [12-deployment.md](12-deployment.md)) once ready. The
  threshold between synchronous and background generation (e.g. row count
  estimate) is a tunable constant, not a hard architectural split — both
  paths call the exact same workbook-building functions.

## Formatting conventions

- Money columns use `lib/money#toDecimalString` for display and an Excel
  number format (`#,##0.000`) matching the 3-decimal millime precision seen
  in the source spreadsheets — never exported as a raw integer millime value.
- Dates formatted per the organization's locale/timezone setting.
- Each export includes a header row with a generation timestamp and the
  applied filters, so a downloaded file is self-describing.

## Explicitly out of scope

No Excel **import**, migration, preview, or reconciliation wizard is built —
per §22 of the brief, this is a one-way `Résido → Excel` capability only.
