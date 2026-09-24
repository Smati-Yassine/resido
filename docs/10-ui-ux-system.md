# 10 — UI / UX System

## Navigation (refined from §33 of the brief)

```
Dashboard

Cycle
  Current Cycle
  Previous Cycles

Property
  Lots
  Buildings
  Owners

Encaissements
  Payments
  Receipts
  Unpaid

Dépenses
  Expenses
  Categories

Trésorerie
  Overview
  Bank Accounts
  Transactions

Reports

Settings
  Organization
  Users & Roles
  Expense Categories
  Audit Log
```

Renamed "Lots" section to "Property" grouping Lots/Buildings/Owners together
(they are one browsing context in practice), and added an explicit
"Settings" section since roles, expense categories, and audit log need a home
that isn't implied elsewhere in the original outline.

## Design principles applied

- **Clarity over decoration** — a financial admin tool is read constantly by
  the same small set of users; consistency and information density beat
  visual flourish. Tailwind used with a small, disciplined design-token set
  (spacing scale, 2–3 semantic colors for status, one accent) rather than an
  ad hoc palette per page.
- **Financial status is always visually explicit** — a shared `<StatusBadge>`
  component with a fixed color mapping (`PAID` green, `PARTIALLY_PAID` amber,
  `PENDING`/unpaid gray/red by overdue-ness, `CANCELLED`/`REVERSED` muted
  strikethrough) used identically across dashboard, lot list, and payment
  history — never a one-off color choice per page.
- **Tables are the primary interface** — lots, payments, expenses, treasury
  transactions, audit log: all use one shared `<DataTable>` primitive
  (sortable columns, cursor pagination matching [06](06-api-architecture.md),
  column-based filters) so behavior is predictable across the app.
- **Search & filtering** are first-class on every list view backed by an
  indexed query (never a client-side filter over an unbounded dataset — see
  [08](08-performance-scalability.md)).
- **Confirmation for destructive/financial actions** — cancel/reverse
  payment or expense, close/reopen a cycle, deactivate a lot/owner: all go
  through a confirmation dialog stating the consequence in plain language
  (e.g. "This will reverse the payment and create a correcting treasury
  entry. The original record is kept for audit.").
- **Empty & loading states** are designed per list view, not generic
  spinners-everywhere — e.g. "No payments recorded yet for this cycle" with a
  direct "Record a payment" call to action, and RSC `loading.tsx` /
  `Suspense` boundaries scoped to the data-dependent region of the page so
  navigation chrome renders instantly.

## Forms

- Every financial input form (payment, expense, assessment override) uses
  the same Zod schema as its Server Action for client-side validation
  feedback, guaranteeing the two never disagree.
- Money inputs use a dedicated `<MoneyInput>` component that accepts
  decimal-string entry (e.g. `518.880`) and converts to millimes via
  `lib/money#fromDecimalString` at the boundary — the raw integer millime
  value is never exposed as a form field a user types into directly.
- Multi-lot payment allocation uses a dedicated `<AllocationBuilder>` widget:
  select lots (searchable), auto-distribute or enter per-lot amounts, with a
  running "remaining to allocate" total that must reach exactly zero before
  submit is enabled — directly modeling the "receipt covering multiple lots"
  pattern confirmed in [01-excel-analysis.md](01-excel-analysis.md).

## Accessibility & responsiveness

Component primitives built on accessible headless components (Radix UI)
under Tailwind styling; keyboard navigation and focus management required
for all interactive components (dialogs, comboboxes, tables) since this is a
professional tool used for extended sessions, not a marketing site. Layout is
responsive down to tablet width as a baseline (desk-bound admin tool primary
use case); full phone-width support is a should-have, not a hard V1
requirement, and is verified opportunistically rather than pixel-audited.
