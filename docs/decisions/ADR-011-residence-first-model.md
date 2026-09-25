# ADR-011: Residence-first model, simplified to the agreed prototype

## Context

The design prototype agreed with the product owner (September 2026)
reshaped the app around one flow: sign in → pick a residence → work inside
one cycle of it. It also removed several V1 concepts that the source
spreadsheets never used. This ADR records what changed. Where the earlier
docs (02, 03, 04, 06, 07, 10) disagree with it, this ADR wins.

## Decision

**Tenancy.** A *residence* is the tenant. It is stored in the existing
`organizations` collection, and tenant-scoped documents keep their
`organizationId` field; only the product vocabulary changed, so no data
migration is needed. Users are global (unique email). A `memberships`
collection (`userId`, `organizationId`, `role`) grants a user access to a
residence. Creating a residence makes its creator `SYNDIC_ADMIN`. The JWT
only identifies the user. `lib/session#requireResidenceSession` resolves the
role per request from the membership, and a non-member gets a 404. Residences
can be archived (hidden, restorable) or deleted (cascade over every tenant
collection, in one transaction). This supersedes the per-organization user
model in ADR-008 and ADR-009.

**Charges.** Each lot has a fixed annual charge (`lots.chargeMillimes`),
not a surface × rate. Opening a cycle bills every active lot that amount as
a `FIXED` assessment. A lot created while a cycle is OPEN is billed in that
cycle in the same transaction. Surface, lot type and floor are gone.
Buildings are presented as *blocs* and bloc names are unique per residence,
case-insensitively.

**Cycles.** `endDate` is optional: an open-ended cycle runs until it is
closed, and closing stamps the end date. At most one cycle is OPEN — the
current one. Closing ends a cycle but does not freeze it: payments,
expenses, charges and owners of a CLOSED cycle stay correctable (a late
payment, a mistake found in the next year), and viewing a cycle through the
cycle switcher shows and edits that cycle's data. Only DRAFT cycles take no
money, since they bill nothing yet. A CLOSED cycle can be reopened — made
the current one again — while no other cycle is OPEN; an open-ended cycle
loses the end date its close had stamped. A cycle of any
status can be deleted: its assessments, payments and expenses go with it,
and every previous/next link to it is repointed. ADR-005 is amended
accordingly.

**Treasury carry-over.** A cycle's starting balance is either CARRIED — the
previous cycle's closing balance, computed live, so a correction in 2025
moves 2026's start — or MANUAL, a typed-in amount (`cycles.openingSource`).
Opening a cycle sets CARRIED when there is a previous cycle. The pencil on
the Finances treasury strip switches between the two, for open and closed
cycles alike. Every cycle's treasury is computed in one pass along the chain
(`computeAllTreasuries`); the closing balance stored at close is kept for the
record only. Cycles opened before `openingSource` existed count as CARRIED
when their stored start still equals the previous cycle's closing snapshot.

**Payments.** A payment covers one or more lots, each fully or partly, as
before. It carries an optional payer name and free-text `note`. Methods are
cash, bank transfer and cheque. Receipts, receipt numbering and cheque-detail
tracking were removed (ADR-006 amended).

**Expenses.** An expense is a label, an amount, a date and an optional
reference. There are no categories; expenses are read month by month, like
the source ledger.

**Owners.** A lean `owners` collection (name, optional phone) replaces the
old owner/ownership-history model. A lot can have several owners
(co-ownership). Ownership is kept per cycle: each assessment records who
owned its lot in that cycle (`assessments.ownerIds`), and `lots.ownerIds` is
who will own the lot in cycles still to open. Records from before
co-ownership (a single `ownerId`) are read as one-owner lists and rewritten
on their next change. In the owner form, lots come grouped — theirs, then
without an owner, then of other owners — with a search; picking another
owner's lot asks whether to replace them or share it. The lot form takes
several owners. Opening
a cycle copies each lot's owner onto its assessment. Lots are assigned from
the owner form (a checklist) or from a lot's Edit form, and a change applies
from the cycle being viewed onward: that cycle and each later one that still
had the same owner — it stops at the first cycle where someone else already
owned the lot — and the lot's own owner when it reaches the latest cycle
(`lots/ownership.ts`). So a sale recorded in 2027 leaves 2026 with its
owner, and a correction to 2026 reaches 2027 only if 2027 had the same owner.
Assessments created before `ownerId` existed follow the lot's owner until it
first changes, which pins them to it. A charge edited in a cycle applies to
that cycle, and to the lot's charge for cycles still to open only when no
later cycle is billed. A
payment starts from a unit search: the unit found is selected for its full
remaining due and its owner's other unpaid units are offered unselected.
There is no payer field: the server takes the units' owner in their cycle
(`ownerId` + `payerName` snapshot), or joins the owners' names when units of
several owners are paid together. Removing an owner applies from the
cycle being viewed onward, like any ownership change: their lots there and
after are left without an owner, earlier cycles keep them. An owner no
cycle names any more is deleted; one a past cycle still names is kept for
that history (`owners.removedAt`) and shown only in the cycles where they own
lots.

**Removed modules:** ownerships, receipts, receiptCounters,
expenseCategories. Legacy indexes that would clash are dropped by
`ensureIndexes`.

**Routes.** `/` is the sign-in / sign-up page; `/privacy` and `/terms` are
public. These three are for signed-out visitors only — a signed-in user is
redirected to `/residences` (the residence list) by the proxy. Everything
under `/residences` (the list and `/residences/[id]/…`, the workspace)
requires a session. A residence's URL uses its slug, made from its name
(`/residences/residence-demo`, `-2`, `-3`… for duplicates, since slugs are
global). Renaming changes the slug and keeps the old one in `oldSlugs`, so
old links — and links made with the residence id — redirect to the current
one. The id stays internal: forms and domain calls never use the slug.
Unknown URLs render one `not-found` page that uses the
signed-in frame or the public frame depending on the session.

**Accounts & sharing.** A user's `sessionVersion` is copied into the login
token and re-checked on every signed-in request: changing the password or
"sign out of all devices" bumps it and ends every existing session (the
current device is re-signed in after a password change). Changing the email
needs the password. A residence is shared by email with a role
(Administrator, Accountant, Read-only); an email without an account becomes
a row in `invitations`, turned into a membership at sign-up or email change.
A residence always keeps one admin — leaving as the last admin is refused,
and deleting your account hands admin to the longest-standing member.
Buttons a role may not use are hidden; the server still enforces
permissions.

**Activity log.** Every mutation writes `auditLogs` (inside the transaction
for financial ones); Settings › Journal shows the last 200 entries.

**Settings layout.** Account settings (user menu): Général (language, theme)
and Compte (profile, password, sign out all devices, export, purge, delete
account). Residence settings: Général (name, city, currency, archive /
delete), Cycles (create, open, close, delete; `/cycles` redirects there),
Membres, Journal — a side navigation and grouped setting rows. One view
(`ResidenceSettingsView`, data from `loadResidenceSettings`) serves the
settings page and the settings modal opened by the gear on each card of the
residences list; the modal loads the data through a server action and
reloads it after every change made inside (`AfterActionProvider`). The cycle
switcher in the top bar picks which cycle every page shows.

**Dashboard.** The residence's home shows the viewed cycle at a glance: the
collection rate on a gauge; what was billed, collected, still owed and the
treasury balance, each against the previous cycle at the same point in its
year (the whole previous cycle once this one is closed); the collection
curve against what was billed; the lots by status (donut) and as a map of
tiles by bloc; the largest balances due by owner; expenses by month; and the
latest journal entries. Charts are plain server-rendered SVG coloured by the
design system's classes.

**URLs.** Addresses name things, never ids: `/residences/<residence
slug>/<page>[/<tab>]?cycle=<cycle slug>` — e.g.
`/residences/haifa-4/finances/expenses?cycle=2025-2026`. Tabs are path
segments (`/finances/payments`, `/finances/expenses`, `/settings/cycles`,
`/settings/members`, `/settings/journal`, `/property/lots`,
`/property/owners`). A cycle's slug comes from its
name (a repeated name gets -2, -3… in date order) and `?cycle=` is left out
for the residence's current cycle. Older forms — `?tab=`, a cycle id,
`/payments`, `/expenses`, `/treasury`, `/cycles` — still work and are
rewritten to these.

**Copropriété.** Lots and owners are one page (`/property`), like Finances:
a strip of figures (lots, owners, lots assigned, still to collect) above
three tabs — Aperçu (blocs side by side, who owns what, the lot map), Lots,
Propriétaires — all for the cycle on screen, from one load
(`lib/property/load.ts`). `/lots` and `/owners` redirect to the tabs.

**First steps.** Until a first cycle opens, the dashboard is a setup guide:
blocs and lots, their owners, the year's cycle, then opening it.

**Residence shell.** Inside a residence the top bar is the signed-in bar of
`/residences` (brand, user menu) plus a residence switcher and the cycle
switcher. The sidebar is light, grouped (Vue d'ensemble, Copropriété, then
Paramètres) and collapses to an icon strip; the choice is a cookie
(`resido-sidebar`) read on the server so reloads keep it.

**Finances.** Payments, expenses and treasury are one page (`/finances`).
The treasury is a strip above the tabs (start + payments − expenses =
balance), with the starting balance edited from a pencil there. The tabs
are Aperçu (money in and out by month, balance over time, payment methods,
what is still to collect, largest expenses, latest movements), Encaissements
and Dépenses (`?tab=payments|expenses`). The old `/payments`, `/expenses` and
`/treasury` URLs redirect to the matching tab.

**Currency.** Amounts stay integer thousandths of the currency
unit. Each residence has a currency (TND, EUR, USD, GBP, CAD, CHF, MAD, DZD)
that sets the symbol and the decimals shown and accepted (3 for TND, 2 for
the others). Switching to a 2-decimal currency is refused while amounts
with thousandths exist. Dates are shown DD/MM/YYYY.

**UI.** One design system in `app/globals.css`: colour tokens for light and
dark, plus component classes (`btn`, `input`, `card`, `badge`, `data-table`,
`modal`, `toast`, …). Pages compose those classes and Tailwind layout
utilities and never hard-code colours. Every action opens a modal where one
is needed and reports its outcome as a toast. Modals come in four sizes
(`confirm` 440, `form` 560, `wide` 760 and `panel` 1040 wide; `wide` and
`panel` have a fixed height and a scrolling body), share one frame (icon,
title, subtitle, close; actions pinned in a footer bar) and never change size
while open: tabbed panels keep their height, and optional fields stay shown,
disabled, instead of appearing. Confirmations stack over the modal they
come from. Language (FR/EN) and theme are
cookies read on the server, so the page renders in the right theme with no
flash.

**Printing.** The dashboard, Finances (each tab) and Copropriété have a
"Imprimer" button. It fetches `/residences/<r>/print/<doc>` — a route
handler rendering a real PDF with `@react-pdf/renderer` for the cycle on
screen — and opens it as a blob in the browser's PDF viewer (downloaded
instead when pop-ups are blocked). Documents: `property` (every lot by bloc
with owners, phones, charge, paid, remaining, status and methods; subtotals;
landscape), `payments` and `expenses` (by month, subtotals, total; payments
also by method), `finances` (a cover — treasury, waterfall, monthly flows,
methods, largest expenses — then both lists) and `report` (a cover — the
collection gauge, the four figures against the previous cycle, treasury,
lots by status, monthly flows, collection by bloc, largest debtors — then
the ledger and both lists). The PDF palette in `lib/print/pdf/theme.ts`
mirrors the light tokens (paper is always light); the fonts are static TTF
instances of Manrope and Fraunces in `lib/print/fonts`, traced into that
route's function.

## Consequences

- Ownership history is the per-cycle owner on each assessment; there is no
  finer history within a cycle. Past payments keep the payer's name.
- Class names must not collide with Tailwind utilities, which win over
  component classes (`table`, `table-row`… are reserved; hence
  `data-table`).
