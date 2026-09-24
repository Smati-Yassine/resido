# 04 — Financial Model

## Money

All money is stored and computed as **integer millimes** (1 TND = 1000
millimes), never floating point. See
[ADR-004](decisions/ADR-004-money-representation.md) for the full rationale
and representation choice (BSON `long`, app-layer branded integer type).

A central `packages/money` (or `lib/money`) module is the *only* place
allowed to do arithmetic on money values:

```ts
type Millimes = number & { readonly __brand: "Millimes" };

function add(a: Millimes, b: Millimes): Millimes;
function subtract(a: Millimes, b: Millimes): Millimes;
function multiplyByRatio(amount: Millimes, numerator: number, denominator: number): Millimes; // banker's rounding, documented
function fromDecimalString(tnd: string): Millimes;   // "518.880" -> 518880
function toDecimalString(m: Millimes): string;       // 518880 -> "518.880"
function isZero / isPositive / isNegative(m: Millimes): boolean;
```

No other module performs `+`, `-`, `*`, `/` on a money field directly — this
is enforced by lint rule (no arithmetic operators on identifiers typed
`Millimes` outside `lib/money`) and by code review.

## Cycle lifecycle

### Statuses

- **DRAFT** — cycle created (dates, name, rate) but not yet active. No
  assessments exist yet. Freely editable/deletable.
- **OPEN** — the active billing period. Exactly one OPEN cycle per
  organization at a time (enforced by a unique partial index, see
  [03](03-mongodb-architecture.md)). Assessments exist for every active lot.
  Payments, expenses, and treasury transactions can be recorded against it.
- **CLOSED** — the period is finalized. See rules below.

Additional statuses considered and rejected for V1: `ARCHIVED` (redundant with
CLOSED at this scale), `SUSPENDED` (no discovered business need). If a future
requirement needs "temporarily halt billing without closing," add it then.

### Opening a cycle

1. Validate no other cycle for the organization is currently OPEN.
2. Snapshot `assessmentRatePerSqmMillimes` (defaults from
   `organization.settings.assessmentDefaultRatePerSqmMillimes`, editable at
   open time).
3. Snapshot `openingBalancesByAccount` from each active BankAccount's current
   `cachedBalanceMillimes`.
4. Generate one `Assessment` per active Lot: `SURFACE_BASED` lots use
   `surfaceSqm × ratePerSqmMillimes`; `COMMON_CHARGE` lots (the
   Excel "Autre/Intermeuble" case) require a `MANUAL` amount entered at open
   time since they have no surface.
5. Link `previousCycleId`/`nextCycleId` if a prior cycle exists.
6. All of the above happens in a single transaction (see
   [03](03-mongodb-architecture.md) §Transaction strategy).

### Cycle closing

- **Can financial transactions be added after closing?** No new Payments,
  Expenses, or Assessments may target a CLOSED cycle. Corrections happen via
  reversal (see below), which is explicitly allowed and itself timestamped —
  it does not "reopen" the cycle.
- **Can a closed cycle be reopened?** Only by `SYNDIC_ADMIN`, and only if no
  subsequent cycle has been opened yet (reopening a cycle that already has a
  successor with its own opening-balance snapshot would corrupt the
  successor's starting point). Reopening is itself an audited action
  (`CYCLE_REOPENED`) and clears `closedAt`/`closedBy`, returning status to
  OPEN. **BUSINESS DECISION REQUIRED**: whether reopening should require a
  reason/approval workflow beyond role-gating — flagged, not decided here.
- **Do unpaid balances carry forward?** **BUSINESS DECISION REQUIRED.** Two
  plausible models: (a) the outstanding amount is simply visible in
  historical reports and a fresh Assessment is created in the next cycle with
  no automatic linkage — the owner just has two open assessments; or
  (b) the system automatically creates a "carried forward" MANUAL assessment
  line in the new cycle equal to the prior shortfall. The Excel data shows
  only a static `Reste` figure per year with no evidence of automatic
  carry-forward. Default recommendation: **(a)**, since it is simpler and
  non-destructive; outstanding-balance reporting already aggregates across
  cycles per lot (see §Outstanding balance below) so nothing is hidden. Do
  not implement (b) without explicit confirmation.
- **How are credits (overpayments) carried forward?** **BUSINESS DECISION
  REQUIRED.** Recommended default: an overpayment creates a `CreditBalance`
  entry (not yet in the V1 schema — flagged as a Phase 3/4 addition once
  confirmed) attributable to the Owner, which can be applied to a future
  Assessment's PaymentAllocation instead of a new cash payment. Until
  confirmed, V1 simply reports the excess as a positive "credit" figure on
  the owner ledger and requires manual allocation by staff.
- **What happens to treasury?** Treasury is cycle-agnostic at the
  BankAccount level (a bank account's balance does not reset). Cycle closing
  only snapshots `closingBalancesByAccount` for historical reporting — it
  never mutates account balances.
- **Are assessments frozen?** Yes — once a cycle is CLOSED, `assessments`
  documents for that cycle become read-only at the API layer (enforced in the
  service layer, not just the UI). Corrections use an `EXCEPTIONAL`
  adjustment assessment referencing the original, never an in-place edit.
- **Are reports immutable?** Yes for a CLOSED cycle: report generation for a
  closed cycle is deterministic and cached (see
  [08](08-performance-scalability.md)); it is regenerated only if the cycle
  is explicitly reopened and later re-closed.
- **Permissions required to close/reopen?** `SYNDIC_ADMIN` only (see
  [07-auth-security.md](07-auth-security.md)).

## Assessments

`calculationMethod` values and when they apply:

| Method | When used | Formula |
|---|---|---|
| SURFACE_BASED | Standard residential/commercial lots (the Excel default) | `surfaceSqm × cycle.assessmentRatePerSqmMillimes` |
| FIXED | A lot type billed a flat amount regardless of surface | Manually configured amount, reused each cycle until changed |
| MANUAL | One-off amount entered at cycle-open time (e.g. `Intermeuble`/common-charge lots with no surface) | Entered value |
| PRORATED | A lot added or removed mid-cycle | `fullCycleAmount × (daysActiveInCycle / totalCycleDays)`, using `multiplyByRatio` |
| EXCEPTIONAL | Special assessments (e.g. a one-time repair levy) outside the normal per-cycle billing | Entered value, independent of the lot's regular assessment |

Only SURFACE_BASED and MANUAL are confirmed as required by the Excel data.
FIXED, PRORATED, and EXCEPTIONAL are modeled (schema supports the enum) but
their calculation logic ships **only when a concrete requirement arrives** —
per the brief's instruction not to build unneeded calculation types
prematurely. PRORATED in particular needs an explicit rule for "lot added
mid-cycle": **BUSINESS DECISION REQUIRED** on whether proration is automatic
or always a manual override.

## Outstanding balance

```
Outstanding(lot, cycle) = Assessment.amountMillimes - Assessment.paidMillimes
```

`Assessment.paidMillimes` only includes allocations from Payments with
`status = COMPLETED`. A `CANCELLED`/`REVERSED` payment's allocations are
excluded — the reversal operation decrements `paidMillimes` and recomputes
`status` in the same transaction that flips the payment's status, so the
denormalized field is always consistent with the ledger.

- **Overpayment**: if `sum(allocations for an assessment) > amountMillimes`,
  the write is rejected — an allocation cannot exceed the assessment's
  remaining balance. A payer wanting to overpay is allocated across *other*
  open assessments for their lots first; a genuine surplus is a credit (see
  cycle-closing §credits above), not an over-filled assessment.
- **Partial payments**: fully supported — `status` becomes `PARTIALLY_PAID`
  once `0 < paidMillimes < amountMillimes`.
- **Cancelled/reversed payments**: never deleted. `status` moves to
  `CANCELLED` (never happened, e.g. data-entry error caught same day) or
  `REVERSED` (did happen, then undone, e.g. bounced check) — both leave the
  original document intact for audit; only the *effect* on the assessment and
  treasury is undone via new, linked entries.

## Payments spanning multiple lots and multiple cycles

- **Multiple lots**: confirmed requirement, directly modeled — one Payment,
  `N` PaymentAllocation entries, each naming its own `assessmentId`/`lotId`
  (which may belong to different Lots owned by the same payer).
- **Multiple cycles**: the schema does not prevent a Payment's allocations
  from referencing Assessments in different cycles (each allocation carries
  its own `cycleId`), so this "just works" structurally. Whether the product
  should proactively suggest cross-cycle allocation in the UI (e.g. auto-apply
  a large payment to a prior cycle's unpaid balance first) is a UX/business
  decision, not a schema constraint — **BUSINESS DECISION REQUIRED** on the
  default allocation order (oldest-assessment-first is the recommended
  default, matching normal accounts-receivable practice).

## Financial corrections — immutability rules

Nothing financially significant is hard-deleted through the application API:

| Entity | Deletable? | Correction mechanism |
|---|---|---|
| Payment | No | `CANCELLED` (same-day mistake, no treasury effect ever applied) or `REVERSED` (effect applied then undone via linked reversal transactions) |
| Expense | No | Same as Payment |
| Assessment | No | `CANCELLED` status, or a linked `EXCEPTIONAL` adjustment assessment for corrections |
| Receipt | No | `voidedAt` set when its Payment is reversed; number is never reused |
| TreasuryTransaction | No | A reversing entry is inserted; the original stays |
| Cycle | Only in DRAFT status | OPEN/CLOSED cycles are never deleted |
| Lot / Owner / Building / BankAccount / ExpenseCategory | Soft-delete only (`active`/`status` flag) once referenced by any financial record; hard delete allowed only if zero references exist |

A database-level TTL or cron job that purges any of the above is explicitly
out of scope — this is a financial system of record.

## Open Business Decisions (consolidated)

| # | Decision | Default recommendation if unconfirmed | Evidence strength |
|---|---|---|---|
| 1 | Receipt numbering scope: continuous vs. per-year/per-cycle | Continuous (`scope = "ALL"`) | Strengthened: Sheet2/Sheet5 of the 2025 file show receipt numbers running continuously to at least `#82` within one year with no visible reset point; the year-boundary behavior (2025→2026) is still unobserved since the 2026 file has no receipt register at all |
| 2 | Do unpaid balances auto-carry-forward into the next cycle as a new assessment line? | No — report outstanding across cycles instead | Unchanged: no counter-evidence found on re-read |
| 3 | How are overpayments/credits tracked and reapplied? | Owner-level credit balance, manually applied by staff until a dedicated CreditBalance entity is built | Unchanged |
| 4 | Can the assessment rate differ by block/lot type within one cycle, not just FIXED overrides per lot? | Not in V1 — single `assessmentRatePerSqmMillimes` per cycle, with per-lot `FIXED`/`MANUAL` overrides as the escape hatch | Unchanged: one flat 8 TND/m² rate confirmed for every row in both years |
| 5 | Default payment-allocation order across multiple open assessments | Oldest assessment (by cycle start date) first | Unchanged |
| 6 | Proration rule for a lot added/removed mid-cycle | Manual entry only in V1; automatic day-based proration deferred | Unchanged |
| 7 | Does reopening a closed cycle require an approval workflow beyond role-gating? | No additional workflow in V1; `SYNDIC_ADMIN` role gate + audit log only | Unchanged |
| 8 | Should joint ownership (e.g. "[Owner A] et [Owner B]", written as one cell) be modeled as one Owner record or split with percentages? | Enter as one Owner record per real-world arrangement by default; the multi-owner percentage-split capability exists in the schema but nothing requires using it | New: confirmed on re-read that the business itself never records a split — it's one free-text name per lot, sometimes naming two people |

These must be confirmed with the business owner before Phase 3 (Cycles &
Assessments) implementation begins in earnest — the schema already
accommodates either answer without a breaking migration. Full supporting
evidence for each row is in
[01-excel-analysis.md](01-excel-analysis.md) §Business rules extracted.
