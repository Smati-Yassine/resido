# 03 — MongoDB Architecture

This is the authoritative schema reference. Every collection below states its
fields, types, required/optional, references vs. embedding, indexes, and the
validation rule for each.

Conventions used throughout:

- `_id: ObjectId` on every document (omitted from tables below for brevity).
- `organizationId: ObjectId` (ref `organizations`) on every tenant-owned
  collection — **always the first key of every compound index** on that
  collection (see [Multi-Tenancy](#multi-tenancy--query-scoping) below).
- Money fields are suffixed `Millimes` and stored as BSON `long` (Int64), never
  `double`. See [ADR-004](decisions/ADR-004-money-representation.md).
- `createdAt` / `updatedAt: Date` on every document (app-managed, not a Mongoose
  plugin — see [ADR-003](decisions/ADR-003-mongodb-driver-vs-mongoose.md)).
- Enums are stored as uppercase strings and validated by Zod + a MongoDB
  `$jsonSchema` collection validator (belt and suspenders: Zod protects the
  app, `$jsonSchema` protects the database from any other writer).

## Collections

### `organizations`

| Field | Type | Req | Notes |
|---|---|---|---|
| name | string | ✓ | |
| slug | string | ✓ | unique, URL-safe |
| status | `ACTIVE \| SUSPENDED` | ✓ | |
| settings.assessmentDefaultRatePerSqmMillimes | long | | default rate seed for new cycles |
| settings.currency | string | ✓ | ISO 4217, e.g. `TND` |
| settings.timezone | string | ✓ | IANA tz, for cycle/date math |
| createdAt / updatedAt | Date | ✓ | |

Indexes: `{ slug: 1 }` unique.

### `users`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId \| null | | null only for `SUPER_ADMIN` |
| email | string | ✓ | unique per organization (or globally for super admins) |
| passwordHash | string | | null if using magic-link/OAuth only |
| name | string | ✓ | |
| role | enum | ✓ | `SUPER_ADMIN \| SYNDIC_ADMIN \| ACCOUNTANT \| STAFF \| OWNER \| VIEWER` |
| ownerId | ObjectId \| null | | ref `owners`, set only when `role = OWNER`, links portal login to their Owner record |
| status | `ACTIVE \| DISABLED` | ✓ | |
| lastLoginAt | Date | | |

Indexes: `{ organizationId: 1, email: 1 }` unique (partial: `organizationId != null`); `{ email: 1 }` unique partial for `role: SUPER_ADMIN`.

### `buildings`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| name | string | ✓ | free-form, e.g. "Bloc A" |
| code | string | | short code |
| notes | string | | |
| active | boolean | ✓ | default true |

Indexes: `{ organizationId: 1, name: 1 }`.

### `lots`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| buildingId | ObjectId \| null | | null for non-building charges (e.g. "Autre/Intermeuble") |
| code | string | ✓ | e.g. `A11`, `Commerce 1` — unique per organization |
| floor | string | | free text (`RDC`, `1`, …) |
| type | enum | ✓ | `APARTMENT \| COMMERCE \| STORAGE \| PARKING \| COMMON_CHARGE \| OTHER` |
| surfaceSqm | Decimal128 \| null | | null for `COMMON_CHARGE` type |
| status | `ACTIVE \| INACTIVE` | ✓ | |
| notes | string | | |

Indexes: `{ organizationId: 1, code: 1 }` unique; `{ organizationId: 1, buildingId: 1 }`.

Rationale for `surfaceSqm` as `Decimal128`: it is a physical measurement used
only as a multiplier input into assessment calculation (an integer/millimes
money value), not itself money — `Decimal128` avoids float drift in the
surface figure while the *result* of the multiplication is immediately
converted to integer millimes.

### `owners`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| kind | `PERSON \| COMPANY` | ✓ | |
| fullName | string | ✓ | person name or company name |
| phone | string | | |
| email | string | | |
| address | string | | |
| taxId | string | | company only |
| notes | string | | |
| active | boolean | ✓ | |

Indexes: `{ organizationId: 1, fullName: 1 }`; `{ organizationId: 1, phone: 1 }` sparse.

### `ownerships`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| ownerId | ObjectId | ✓ | ref `owners` |
| lotId | ObjectId | ✓ | ref `lots` |
| sharePercent | int (basis points, 0–10000) | ✓ | 10000 = 100% |
| isPrimary | boolean | ✓ | primary contact for billing/correspondence |
| startDate | Date | ✓ | |
| endDate | Date \| null | | null = current |
| notes | string | | |

Indexes: `{ organizationId: 1, lotId: 1, endDate: 1 }` (find current owners of a lot); `{ organizationId: 1, ownerId: 1, endDate: 1 }` (find an owner's current lots).
Validation: application-level invariant — sum of `sharePercent` across active ownerships of a lot must equal 10000; enforced in the service layer inside the same transaction that writes ownership rows, not by the database.

### `cycles`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| name | string | ✓ | e.g. "2025-2026" |
| startDate | Date | ✓ | |
| endDate | Date | ✓ | `endDate > startDate` |
| status | enum | ✓ | `DRAFT \| OPEN \| CLOSED` |
| assessmentRatePerSqmMillimes | long | | rate snapshot used for SURFACE_BASED assessments this cycle |
| openedAt | Date \| null | | |
| closedAt | Date \| null | | |
| createdBy | ObjectId | ✓ | ref `users` |
| closedBy | ObjectId \| null | | ref `users` |
| openingTreasuryBalanceMillimes | long \| null | | the cycle's single treasury "start point" — see [Treasury](#treasury) |
| closingTreasuryBalanceMillimes | long \| null | | computed at close time: opening + income - expenses |
| previousCycleId | ObjectId \| null | | ref `cycles` |
| nextCycleId | ObjectId \| null | | ref `cycles`, set when the next cycle is created |

Indexes: `{ organizationId: 1, status: 1 }`; `{ organizationId: 1, startDate: -1 }`; unique partial `{ organizationId: 1, status: 1 }` where `status: "OPEN"` (**at most one OPEN cycle per organization at a time** — a deliberate constraint, see ADR-005).

Full lifecycle rules: [04-financial-model.md](04-financial-model.md).

### `assessments`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| cycleId | ObjectId | ✓ | ref `cycles` |
| lotId | ObjectId | ✓ | ref `lots` |
| amountMillimes | long | ✓ | frozen at creation |
| calculationMethod | enum | ✓ | `FIXED \| SURFACE_BASED \| MANUAL \| PRORATED \| EXCEPTIONAL` |
| calculationInputs | object | | e.g. `{ surfaceSqm, ratePerSqmMillimes }` for audit/recompute transparency |
| dueDate | Date | ✓ | |
| status | enum | ✓ | `PENDING \| PARTIALLY_PAID \| PAID \| CANCELLED` — **denormalized read model**, recomputed transactionally on every allocation/reversal write, never hand-edited |
| paidMillimes | long | ✓ | denormalized running total of valid allocations, default 0 |
| notes | string | | |

Indexes: `{ organizationId: 1, cycleId: 1, lotId: 1 }` unique (one assessment per lot per cycle — see ADR on multiple assessments below); `{ organizationId: 1, lotId: 1, cycleId: -1 }` (a lot's assessment history); `{ organizationId: 1, cycleId: 1, status: 1 }` (unpaid-lots dashboard query).

`paidMillimes` / `status` are intentionally denormalized onto the Assessment
so the dashboard's "lots paid / partial / unpaid" and "outstanding amount"
figures are single-collection queries, not aggregations across the whole
Payment history on every page load. They are only ever written inside the same
MongoDB transaction as the PaymentAllocation that changes them — see
[Transaction Strategy](#transaction-strategy).

### `payments`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| payerOwnerId | ObjectId \| null | | ref `owners`; null allowed for a payer not yet registered as an Owner |
| payerNameSnapshot | string | ✓ | denormalized name at time of payment, for receipts even if Owner is later edited/removed |
| date | Date | ✓ | |
| amountMillimes | long | ✓ | must equal sum of `allocations[].amountMillimes` |
| method | enum | ✓ | `CASH \| BANK_TRANSFER \| CHECK \| CARD \| OTHER` |
| checkDetails | object \| null | | `{ checkNumber, bank, issueDate, depositDate, status }`, required iff `method = CHECK` |
| reference | string | | free-text external reference |
| status | enum | ✓ | `COMPLETED \| CANCELLED \| REVERSED` |
| cancelledReason | string \| null | | |
| idempotencyKey | string | ✓ | client-generated, see [Idempotency](#idempotency-strategy) |
| allocations | array (embedded) | ✓ | `[{ assessmentId, lotId, cycleId, amountMillimes }]` — see rationale in [02-domain-model.md](02-domain-model.md) |
| receiptId | ObjectId \| null | | ref `receipts`, set once the receipt is generated (same transaction) |
| createdBy | ObjectId | ✓ | ref `users` |

There is no `bankAccountId`/`treasuryTransactionId` here — see
[Treasury](#treasury) below for why: treasury is a single running cycle
balance, not a per-payment account assignment.

Indexes: `{ organizationId: 1, date: -1 }`; `{ organizationId: 1, payerOwnerId: 1, date: -1 }`; `{ organizationId: 1, "allocations.lotId": 1 }` (payments touching a lot); `{ organizationId: 1, idempotencyKey: 1 }` unique.

### `receipts`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| number | int | ✓ | sequential, assigned via atomic counter — see [Receipt numbering](#receipt-numbering) |
| paymentId | ObjectId | ✓ | ref `payments`, unique |
| date | Date | ✓ | |
| payerNameSnapshot | string | ✓ | |
| amountMillimes | long | ✓ | |
| allocationsSnapshot | array | ✓ | copy of the payment's allocations at issue time, with lot codes resolved, so the receipt document renders standalone even if lots are later renamed |
| voidedAt | Date \| null | | set if the underlying payment is reversed; receipt itself is never deleted |

Indexes: `{ organizationId: 1, number: 1 }` unique; `{ organizationId: 1, paymentId: 1 }` unique.

### `receiptCounters`

Single-purpose collection backing the atomic counter (see
[Receipt numbering](#receipt-numbering)).

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| scope | string | ✓ | `"ALL"` or a year string, depending on the numbering-scope decision |
| lastNumber | int | ✓ | |

Indexes: `{ organizationId: 1, scope: 1 }` unique.

### `expenseCategories`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| code | string | ✓ | e.g. `SALARY`, `ELECTRICITY` |
| label | string | ✓ | display name |
| active | boolean | ✓ | |

Indexes: `{ organizationId: 1, code: 1 }` unique. Seeded per organization with
the categories inferred from the Excel data (§01) but fully editable.

### `expenses`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId | ✓ | |
| cycleId | ObjectId | ✓ | ref `cycles`, resolved from `date` at creation and stored |
| categoryId | ObjectId | ✓ | ref `expenseCategories` |
| date | Date | ✓ | |
| amountMillimes | long | ✓ | |
| payee | string | ✓ | supplier/payee free text (no separate Supplier entity in V1) |
| description | string | | |
| method | enum | ✓ | same enum as Payment method |
| checkDetails | object \| null | | same shape as Payment |
| reference | string | | |
| attachments | array | | `[{ url, filename, uploadedAt }]` — object storage metadata only |
| status | enum | ✓ | `RECORDED \| CANCELLED \| REVERSED` |
| idempotencyKey | string | ✓ | |
| createdBy | ObjectId | ✓ | |

Indexes: `{ organizationId: 1, date: -1 }`; `{ organizationId: 1, cycleId: 1, categoryId: 1 }` (category breakdown per cycle); `{ organizationId: 1, idempotencyKey: 1 }` unique.

### `auditLogs`

| Field | Type | Req | Notes |
|---|---|---|---|
| organizationId | ObjectId \| null | | null for cross-tenant super-admin actions |
| actorUserId | ObjectId | ✓ | |
| action | enum | ✓ | see list in [02-domain-model.md](02-domain-model.md) / §28 of the brief |
| entityType | string | ✓ | e.g. `"payment"` |
| entityId | ObjectId | ✓ | |
| before | object \| null | | omit fields that are large or sensitive |
| after | object \| null | | |
| metadata | object | | |
| createdAt | Date | ✓ | |

Indexes: `{ organizationId: 1, createdAt: -1 }`; `{ organizationId: 1, entityType: 1, entityId: 1 }`. This collection is append-only (no update/delete API); consider a capped-growth strategy (archival to cold storage) once volume justifies it — not needed at 1,000-user scale.

## Multi-tenancy / query scoping

- Every tenant collection's **first** compound-index key and **first**
  application-level query filter is `organizationId`.
- The repository layer (see [06](06-api-architecture.md)) exposes no method
  that can query a tenant collection without an explicit `organizationId`
  parameter — there is no "query all" escape hatch. This is enforced by
  TypeScript function signatures, not by convention.
- The authenticated session carries `organizationId`; every Server
  Action/Route Handler derives its query scope from the session, never from a
  client-supplied `organizationId` in the request body (which would allow
  cross-tenant access via a forged payload).
- `SUPER_ADMIN` users operate through a separate, explicitly audited code path
  that is allowed to pass an organizationId (e.g. to list organizations), never
  through the tenant-scoped repositories.

## Transaction strategy

MongoDB multi-document ACID transactions (requiring a replica set — Atlas
provides this by default) are used **only** where an operation must keep
multiple documents consistent and a partial write would corrupt financial
state:

| Operation | Documents touched atomically | Why a transaction is required |
|---|---|---|
| Record a payment | `payments` (insert) + `assessments` (paidMillimes/status update, one per allocation) + `receiptCounters` (increment) + `receipts` (insert) + `auditLogs` (insert) | A payment that updates assessments but fails to create its receipt is a silent accounting error. |
| Cancel/reverse a payment | `payments` (status update) + `assessments` (paidMillimes/status rollback) + `receipts` (void) + `auditLogs` | Same reasoning, in reverse. |
| Record an expense | `expenses` (insert) + `auditLogs` | |
| Cancel/reverse an expense | `expenses` (status update) + `auditLogs` | |
| Open a cycle | `cycles` (status → OPEN, opening treasury balance set) + `assessments` (bulk insert, one per active lot) + `auditLogs` | The cycle must never be OPEN with a partial set of assessments. |
| Close a cycle | `cycles` (status → CLOSED, closing treasury balance computed and stored) + `auditLogs` | |

Operations **not** wrapped in a transaction (single-document writes, or
read-only): editing a Lot/Owner/Building profile, editing Ownership (single
document — but the sum-to-100% invariant check reads siblings first, so it
still runs inside a short transaction to avoid a race between two concurrent
ownership edits), listing/reporting/dashboard queries, Excel export generation.

## Idempotency strategy

Payment, Expense, and Receipt creation accept a client-generated
`idempotencyKey` (UUID generated by the browser/Server Action at the moment
the user submits the form). It is stored with a unique index; a retried
submission (double-click, network retry) hits the unique-index conflict and
the server returns the original result instead of creating a duplicate
financial record. Keys are scoped per organization and never reused across
entities.

## Receipt numbering

Receipt numbers **must never** be computed as `MAX(number) + 1` — under
concurrent writes two requests can read the same max and collide. Instead:

`receiptCounters` holds one document per `(organizationId, scope)` and receipt
issuance runs `findOneAndUpdate({ organizationId, scope }, { $inc: { lastNumber: 1 } }, { upsert: true, returnDocument: "after" })` — a single atomic
operation guaranteed collision-free even under heavy concurrency, executed
inside the same transaction as the rest of the payment write.

Whether `scope` is `"ALL"` (continuous numbering forever, the recommended
default) or a per-year/per-cycle string (matching what the Excel data
*appears* to do, but does not confirm) is a
**BUSINESS DECISION REQUIRED** — see [04-financial-model.md](04-financial-model.md).
The schema supports either without migration pain since `scope` is just a
string key.

## Document size & growth considerations

- `payments.allocations` is bounded by "number of lots one payment can cover"
  — realistically under 50 even for a large `intermeuble`-style bulk payment;
  no risk of approaching the 16MB document limit.
- `assessments`, `expenses`, `payments`, `auditLogs` all grow linearly with
  time and are always accessed via indexed, paginated queries — never fully
  scanned or loaded into one document.
- At ~150 lots × 1 assessment/cycle × a handful of cycles/year, and ~1,000
  concurrent *users* (not necessarily 1,000 organizations), collection sizes
  stay small (thousands to low tens-of-thousands of documents per
  organization per year). The design is index-driven so it also scales to
  many more lots/organizations without redesign.

## Aggregation pipeline usage

Aggregation is used for **reporting and dashboards**, never for computing a
value that gates a financial write (those reads happen inside the write's
transaction against denormalized fields). Examples:

- Cycle collection-rate: `assessments` grouped by `cycleId`, summing
  `amountMillimes` and `paidMillimes`.
- Expense category breakdown: `expenses` grouped by `cycleId, categoryId`.
- Cycle treasury total: `payments.allocations` (unwound, filtered to the
  cycle, summed) minus `expenses` (filtered to the cycle, summed) — see
  [Treasury](#treasury).

## Treasury

**Corrected from an earlier draft of this design**, which modeled a
multi-account `bankAccounts`/`treasuryTransactions` ledger with transfers and
manual adjustments. Re-reading the actual source data
([01-excel-analysis.md](01-excel-analysis.md), Sheet4/Sheet5) shows the real
business model is much simpler: **one running balance**, seeded from a single
starting point ("Solde Banque BNA Aout 2024" / "Solde depart"), moved by
income and expenses — `Solde depart + Recette − Depense = Solde`. There is no
evidence of multiple bank accounts, inter-account transfers, or account
lifecycle management in the source data, so none of that is built.

Concretely:

- `cycles.openingTreasuryBalanceMillimes` is the single starting point for a
  cycle, set when the cycle is opened (defaults to the previous cycle's
  `closingTreasuryBalanceMillimes` if one exists, else 0).
- The current balance is **computed**, not stored as a ledger: `opening +
  Σ(payments.allocations.amountMillimes for this cycle, status COMPLETED) −
  Σ(expenses.amountMillimes for this cycle, status RECORDED)`.
- `cycles.closingTreasuryBalanceMillimes` snapshots this computed value when
  the cycle is closed, becoming the next cycle's default opening balance.
- No `bankAccounts` or `treasuryTransactions` collections exist. `payments`
  and `expenses` carry no `bankAccountId`/`treasuryTransactionId` field.

See [08-performance-scalability.md](08-performance-scalability.md) for the
full index-to-query mapping and [06-api-architecture.md](06-api-architecture.md)
for how aggregations are exposed.
