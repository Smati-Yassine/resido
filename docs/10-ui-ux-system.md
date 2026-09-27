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
professional tool used for extended sessions, not a marketing site.

The layout is fully responsive, from a 360 px phone to a wide desktop, all
from `app/globals.css`:

- **Shell.** Desktop (≥ 1024): the sidebar, open or collapsed as the user
  left it. Tablet (768–1023): always the icon strip. Phone (< 768): no
  sidebar, a tab bar at the bottom (`TabBar` in `WorkspaceNav.tsx`); the top
  bar keeps the residence and cycle switchers and the account menu.
- **Tables** marked `data-table-stack` become a list of two-line entries when
  their card is under 46rem wide (a container query, so it also holds in
  modals): `.cell-lead` and `.cell-figure` on line 1, the other cells then
  `.cell-actions` on line 2; `.cell-wide` cells only show in the full table;
  a cell with `data-label` names itself once the column head is gone.
- **Modals and menus** are sheets from the bottom edge on a phone; a modal's
  header drags it down to close it.
- **Touch.** Controls are at least 40 px on a touch screen, fields 16 px
  (no zoom on focus in iOS), hover effects only where a pointer hovers.
- **Safe areas.** The page covers the whole screen (`viewport-fit=cover`);
  bars keep clear of the notch and home indicator through `--safe-*`.

Résido also installs as an app (PWA): `app/manifest.ts`, icons drawn by
`scripts/generate-icons.ts`, and a service worker (`public/sw.js`, production
only) that stores the app's static code and shows `public/offline.html` when
a page cannot load. Pages and data are never stored on the device. With
`experimental.useOffline`, navigations and saves made while offline wait for
the connection: a bar says so on a large screen, a full screen with a retry
button on a phone (`components/ui/AppRuntime.tsx`).

Updates need no hard refresh. Pages are never cached, so opening the app
loads the latest deploy. A page left open picks it up too: `deploymentId`
(`next.config.ts`) makes its next navigation a full load, and returning to
the app from the background compares `/api/version` and reloads — unless a
modal is open.

On a touch device where Résido is not installed, the landing and residences
pages offer it (`components/ui/InstallPrompt.tsx`): the system's install
dialog on Android, the Share → "Add to Home Screen" steps on iPhone and iPad.
"Not now" hides it for two weeks.
