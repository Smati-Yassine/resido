# ADR-006: Payment with embedded PaymentAllocation array

## Context

The Excel receipt register confirms a single payment can cover multiple lots
in one transaction (§11/§14 of the brief; e.g. one receipt for 11,631.920
TND split across six lots). Need to decide how `Payment` and
`PaymentAllocation` relate structurally in MongoDB.

## Decision

`PaymentAllocation` is an **embedded array** on the `Payment` document
(`payments.allocations: [{ assessmentId, lotId, cycleId, amountMillimes }]`),
not a separate collection.

## Rationale

- Allocations are always created together with their parent Payment, in the
  same user action, and are always read together with it (a payment's
  receipt and detail view show all its allocations at once) — the textbook
  case for embedding in MongoDB.
- The array is **bounded**: realistically a handful to a few dozen lots per
  payment, nowhere near the 16MB document size limit (§03 Document size
  considerations).
- Embedding keeps "sum of allocations must equal payment amount" a
  same-document invariant, checkable without a cross-collection read.
- Queries that need "payments touching lot X" still work efficiently via an
  index on `allocations.lotId` (a multikey index) — the one access pattern
  that might argue for a separate collection is fully served without one.

## Alternatives considered

- **Separate `paymentAllocations` collection** — would allow allocations to
  be queried/paginated independently of their payment, which no real access
  pattern in this domain requires (allocations are never browsed as their
  own list; they're always viewed in the context of a payment or rolled up
  onto an assessment via the denormalized `paidMillimes`). Would add a
  second write to every payment transaction and a `$lookup` for every
  payment detail view, for no corresponding benefit.

## Consequences

- `assessments.paidMillimes`/`status` (denormalized, §03) is the mechanism
  for "how much has this assessment received" queries — not a live
  aggregation over `payments.allocations` — because an embedded array
  inside another collection cannot be efficiently `$group`-ed across
  documents at dashboard scale. This denormalization is written
  transactionally alongside the allocation, so it never drifts.
- If a future requirement needs allocations to be independently
  queryable/paginated at large scale (e.g. thousands of allocations per
  payment, which is not a realistic scenario here), this decision would
  need revisiting — documented as an explicit non-goal for V1.
