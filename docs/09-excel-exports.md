# 09 — Excel Export and Import

Excel export is a required reporting feature. It is **not** the internal
data model (§46 of the brief) — every export is generated on demand from
normalized MongoDB data through the same domain read functions/aggregations
used by the UI. Since ADR-010's revision, one export — the whole residence —
can also be imported back, always as a **new** residence (see "Import" below).

## Library

`exceljs` (TypeScript-friendly, streaming writer, supports formatting/column
widths/number formats needed for a professional financial export) generating
`.xlsx` files server-side. Chosen over `xlsx`/`SheetJS` community edition for
better streaming write support and native styling API, and over building CSV
only, since the brief explicitly asks for Excel-formatted output matching the
business's existing spreadsheet literacy.

## What exists

- **Account export** — `GET /api/exports/account`: everything of the user's
  residences, one sheet per kind of record (`lib/export/account-workbook.ts`).
- **Cycle exports** — `GET /residences/<slug>/export/<doc>?cycle=…`, from
  the same data as the PDFs (`lib/print/load.ts`), with the same access rules
  (`lib/export/cycle-workbook.ts`):
  - `property`, `payments`, `expenses`, `report` — the printed documents
    themselves, laid out as the PDF (see "The printed report in Excel"):
    Copropriété; Encaissements; Dépenses; and the report's four sheets,
    Synthèse, Copropriété, Encaissements, Dépenses;
  - `unpaid` — the lots still owing, most owed first, as a plain table;
  - `finances` — the treasury: summary, month by month, every movement with
    its running balance.

  The "Excel" menu beside "Print" (dashboard, Finances, Copropriété) lists
  them, the page's own first. A computer downloads the file; a phone or
  tablet hands it to the share menu, like the PDFs.
- **Whole residence** — `GET /residences/<slug>/export/all`: every cycle in
  one workbook (`lib/export/residence-workbook.ts`), last in the Excel menu
  and in Settings › General › Data. Any member can download it.
  - First the Résidence sheet, then each cycle's printed report, newest
    first, on blue tabs: "Cycle 2026 — Synthèse", "— Copropriété",
    "— Encaissements", "— Dépenses" (a cycle in preparation: its
    Copropriété alone, charges only, as the PDF).
  - Then, on grey tabs, the records (what an import reads): Résidence (name, city, currency),
    Cycles (status, dates, starting balance and whether it is carried over,
    plus each cycle's dashboard figures), Blocs, Lots, Propriétaires
    (with a `P1`, `P2`… ref), Charges (every lot of every cycle: its owners
    that cycle, charge, paid, left, status, payment methods), Encaissements
    (numbered), Répartition (how each payment is split, by cycle and lot),
    Dépenses.
  - And, ignored on import: Membres, Journal.

  The sheet and column names, in both languages, are defined once in
  `lib/export/residence-format.ts` and shared by the export and the import.

## Import

`POST /api/imports/residence` (multipart `file`, optional `name`; 4 MB at
most) — "Import" on the residences list, or Settings › General › Data.
`lib/import/residence-import.ts`:

- **Always a new residence**, owned by the importer (SYNDIC_ADMIN). Nothing
  is merged into or overwrites an existing residence.
- **Checked whole before anything is written.** Every problem is reported
  with its sheet and Excel row ("Lots, ligne 6 : « beaucoup » n'est pas un
  montant valide"), up to 25; a record with one wrong cell is still known to
  the rows that name it, so one mistake gives one message. With any
  problem, nothing is imported. Otherwise every record goes in in one
  transaction, with a `RESIDENCE_IMPORTED` journal entry.
- **Derived figures are recomputed, never trusted**: what a lot has paid
  and its status come from the payments' split; a payment's amount must equal
  its split; no charge can be paid beyond its amount; a closed cycle's
  closing balance is worked out from its movements.
- **Either language**, and forgiving of hand-made files: sheets and headers
  match in French or English (accents and case ignored), status and method
  words in either language or as codes, amounts as numbers or text
  ("1 209,760"), dates as Excel dates or "31/12/2025"/"2025-12-31". Owners
  can be given by name instead of ref (an unknown name adds that owner); a
  file without Répartition can pay one lot in one cycle per payment;
  without owner columns in Charges, a cycle bills the lots' owners.
- Not imported: members (the importer is the only one), the journal,
  cancelled payments and expenses (never exported).

### The printed report in Excel

`lib/export/report-sheets.ts` lays a cycle out as `lib/print/pdf` prints
it, with the PDF's own words (the dictionary's) and colours
(`lib/print/pdf/theme.ts`):

- **Synthèse** — the report cover: the four figures and the collection rate,
  each with what it means and the previous cycle beside it (to date while a
  cycle runs, as the dashboard compares); the treasury in four lines; the
  collection by bloc; the payment methods; money in, out and balance by month.
- **Copropriété** — every lot by bloc: owners, phones, charge, paid, left to
  pay (red when owed), status (coloured like the app's badges), payment
  methods; a band opening each bloc, its subtotal, the grand total and the
  collection rate.
- **Encaissements** / **Dépenses** — month by month, each month's subtotal,
  then the total; the payments end with the totals by method.

Each page opens with the PDF's header (residence, city, document, cycle,
status and dates, when it was made); the column titles are frozen and repeat
on every printed page (A4, one page wide). Left to pay, subtotals and totals
are live formulas — `SUBTOTAL(9, …)`, so a total never counts the subtotals
above it — with their values stored for viewers that do not recalculate.

### The record sheets

Every record sheet opens with its caption (residence, document, cycle and dates,
when it was generated), then a frozen, filterable header; money columns are
numbers in the currency's format, dates real Excel dates, and money tables
end with a totals row. Shared helpers: `lib/export/sheets.ts`.

Still to build from the plan below: the background path for very large
exports (every cycle has stayed small enough to generate on request so far).

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

No merging an import into an existing residence, and no reconciliation
wizard: an import makes a new residence, whole or not at all.
