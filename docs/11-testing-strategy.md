# 11 — Testing Strategy

## Unit tests (`tests/unit`, Vitest)

Focused on pure logic with no I/O:

- `lib/money` — `add`/`subtract`/`multiplyByRatio` rounding behavior,
  `fromDecimalString`/`toDecimalString` round-tripping, rejection of
  non-integer/float inputs, the exact `0.1 + 0.2` class of bug is asserted
  impossible by construction (millimes are integers).
- Cycle date logic — arbitrary start/end validation, "is date within cycle,"
  overlap detection between cycles for one organization.
- Assessment calculation — `SURFACE_BASED` formula against the exact figures
  extracted from the Excel analysis (e.g. `151.22 sqm × 8.000 = 1209.760
  TND` as a regression fixture), `MANUAL`/`FIXED` pass-through.
- Payment allocation — sum-must-equal-payment-amount validation, rejection of
  an allocation exceeding an assessment's remaining balance, allocation
  ordering helper (oldest-assessment-first default from
  [04](04-financial-model.md)).
- Outstanding balance derivation — `amountMillimes - paidMillimes` across
  partial/cancelled/reversed payment scenarios.
- Treasury calculation — running balance math, transfer leg pairing.

## Integration tests (`tests/integration`, Vitest + `mongodb-memory-server`)

Run against a real (in-memory, replica-set-enabled) MongoDB instance so
transactions, indexes, and uniqueness constraints are exercised for real,
not mocked:

- Payment transaction: record → assessment updated → receipt created with a
  correct atomically-assigned number → treasury transaction + bank balance
  updated → audit log written, all-or-nothing on induced failure (e.g.
  simulate a duplicate idempotency key mid-flow).
- Payment allocation edge cases: multi-lot allocation, overpayment rejection,
  partial payment, cancellation, reversal (and their effect reversal on
  assessment/treasury).
- Receipt numbering under concurrency: fire N concurrent `recordPayment`
  calls, assert N unique, gapless (or documented-gap) sequential numbers,
  no duplicates — the concrete regression test for the
  `MAX(number)+1` anti-pattern the brief calls out.
- Expense creation transaction, including check-details validation.
- Cycle open: bulk assessment generation across N lots, rate snapshot
  correctness, rejection of opening a second cycle while one is already OPEN.
- Cycle close: balances snapshot correctness, assessments become read-only,
  reopen path (only when no successor cycle exists) restores OPEN state
  correctly.
- Multi-tenant isolation: a query/service call scoped to organization A can
  never return or mutate organization B's documents, tested by attempting
  cross-tenant access and asserting rejection/empty result.

## End-to-end tests (`tests/e2e`, Playwright)

The full flow from §36 of the brief, run against a seeded test database:

```
Login → Create organization → Create building → Create lot → Create owner
→ Create cycle → Open cycle (assessment generated) → Record payment
→ Generate receipt → Record expense → View dashboard → Close cycle
→ Export Excel
```

Plus targeted E2E flows for: multi-lot payment allocation, payment
cancellation/reversal, RBAC (a STAFF-role user cannot close a cycle; an
OWNER-role user only sees their own lots), and export download completing
successfully for each export type in [09](09-excel-exports.md).

## Coverage expectations

Financial modules (`money`, `payments`, `assessments`, `treasury`, `cycles`)
require the highest coverage bar (all branches of allocation/rounding/
reversal logic) since correctness there is the product's core value
proposition per §49 of the brief. UI-only components are tested more lightly
(rendering + key interactions), not for exhaustive visual coverage.

## CI

Unit + integration tests run on every push (integration tests against
`mongodb-memory-server`, no external dependency needed in CI). E2E runs on
pull requests targeting `main` (and can be run against a disposable seeded
Atlas test cluster or `mongodb-memory-server` with a headless browser),
gating merge on financial-flow correctness before any deploy.
