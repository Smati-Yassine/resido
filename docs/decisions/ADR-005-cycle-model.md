# ADR-005: Cycle as a first-class, arbitrarily-dated entity with at most one OPEN cycle per organization

## Context

The Excel data bills annually but Résido must support fully custom cycle
boundaries (§7 of the brief: e.g. `01/07/2025 → 30/09/2026`), not tied to a
calendar year, with a defined lifecycle (§8).

## Decision

- `Cycle` is its own collection (not implied by date ranges scattered across
  other collections), carrying `startDate`/`endDate` as plain `Date` values
  with no calendar-alignment constraint beyond `endDate > startDate`.
- A **unique partial index** enforces at most one `status: "OPEN"` cycle per
  `organizationId` at any time. This is a deliberate constraint: the
  business process (and the Excel data) implies one active billing period
  drives assessment generation and current-period reporting at a time.
  DRAFT cycles (planning ahead) and CLOSED cycles (history) are unrestricted
  in number.
- Every Assessment, Expense, and TreasuryTransaction carries an explicit
  `cycleId` set at creation time (not recomputed later from date ranges),
  so historical records remain stable even if a DRAFT cycle's dates are
  edited before opening.
- Full lifecycle rules (open/close/reopen, freezing, carry-forward) are in
  [04-financial-model.md](../04-financial-model.md).

## Alternatives considered

- **Multiple concurrent OPEN cycles** — rejected: nothing in the business
  data or brief suggests overlapping active billing periods, and allowing
  it would make "the current cycle" (used pervasively in dashboards, §20)
  ambiguous. If a real future need for overlapping cycles emerges (e.g.
  transitioning between two billing schemes), it should be handled by a
  transition workflow, not silent multi-OPEN support.
- **Deriving "current cycle" from `now()` falling between dates** — rejected:
  this would make cycle boundaries load-bearing for correctness the moment
  they're edited, and cannot represent a DRAFT cycle prepared in advance
  or a gap between cycles. An explicit `status` field is simpler and more
  auditable.

## Consequences

- Opening a new cycle while one is already open fails fast at the unique
  index (defense in depth beyond the application-level check in the
  transactional open-cycle operation, §03).
- Reports and financial records reference cycles by ID, not by date range,
  so they remain accurate under DRAFT-cycle date edits.
- The "no calendar alignment" requirement is satisfied trivially — nothing
  in the schema assumes month/quarter/year boundaries anywhere (see
  explicit avoidance of `JanuaryPayments`/`Quarter1`-style collections,
  §2/§3 of the brief).
