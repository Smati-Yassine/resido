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
closed, and closing stamps the end date. Opening carries the previous
cycle's closing balance over as the opening treasury balance. That opening
balance is the one typed-in treasury figure and stays editable while the
cycle is OPEN (`setOpeningBalance`). Reopening was removed. A cycle of any
status can be deleted: its assessments, payments and expenses go with it, and
every previous/next link to it is repointed. A later cycle keeps the opening
balance it already carried over. ADR-005 is
amended accordingly.

**Payments.** A payment covers one or more lots, each fully or partly, as
before. It carries an optional payer name and free-text `note`. Methods are
cash, bank transfer and cheque. Receipts, receipt numbering and cheque-detail
tracking were removed (ADR-006 amended).

**Expenses.** An expense is a label, an amount, a date and an optional
reference. There are no categories; expenses are read month by month, like
the source ledger.

**Owners.** A lean `owners` collection (name, optional phone) replaces the
old owner/ownership-history model: `lots.ownerId` points to at most one
owner. Lots are assigned from the owner form (a checklist that moves a lot
from its previous owner) or from the owner dropdown on each lot row. A
payment starts from a unit search: the unit found is selected for its full
remaining due and its owner's other unpaid units are offered unselected.
There is no payer field: the server takes the owner of the units paid
(`ownerId` + `payerName` snapshot), or joins the owners' names when units of
several owners are paid together. Deleting an owner leaves their lots without one.

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
delete), Membres, Journal. Cycles are not a setting: they have their own
page in the residence sidebar.

**Residence shell.** Inside a residence the top bar is the signed-in bar of
`/residences` (brand, user menu) plus a residence switcher and the cycle
switcher. The sidebar is light, grouped (Vue d'ensemble, Copropriété,
Finances, then Paramètres) and collapses to an icon strip; the choice is a
cookie (`resido-sidebar`) read on the server so reloads keep it.

**Currency.** Amounts stay integer thousandths of the currency
unit. Each residence has a currency (TND, EUR, USD, GBP, CAD, CHF, MAD, DZD)
that sets the symbol and the decimals shown and accepted (3 for TND, 2 for
the others). Switching to a 2-decimal currency is refused while amounts
with thousandths exist. Dates are shown DD/MM/YYYY.

**UI.** One design system in `app/globals.css`: colour tokens for light and
dark, plus component classes (`btn`, `input`, `card`, `badge`, `data-table`,
`modal`, `toast`, …). Pages compose those classes and Tailwind layout
utilities and never hard-code colours. Every action opens a modal where one
is needed and reports its outcome as a toast. Language (FR/EN) and theme are
cookies read on the server, so the page renders in the right theme with no
flash.

## Consequences

- Ownership history (who owned a lot before) is not kept; past payments
  keep the payer's name.
- Class names must not collide with Tailwind utilities, which win over
  component classes (`table`, `table-row`… are reserved; hence
  `data-table`).
