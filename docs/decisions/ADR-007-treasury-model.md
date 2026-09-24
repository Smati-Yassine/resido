# ADR-007: Treasury as a single computed running balance per cycle

## Context

The Excel data (Sheet4/Sheet5 of the 2025 file) tracks treasury as one manual
running balance: opening balance ("Solde Banque BNA Aout 2024" / "Solde
depart") + income − expenses = current balance. There is exactly one such
number per period in the source data — no evidence of multiple bank
accounts, inter-account transfers, or account lifecycle management.

**Revision note:** an earlier version of this ADR and its implementation
modeled a multi-account `bankAccounts`/`treasuryTransactions` ledger with
account CRUD, transfers, and manual adjustments — reasonable in the abstract
(§18/§19 of the original design brief describe exactly that), but not
grounded in what the actual business data shows, and needlessly heavy for a
V1 built from that data. It was removed after re-reading the Excel source
and is documented here as corrected, not layered on top of the old text.

## Decision

- `cycles.openingTreasuryBalanceMillimes` is the single treasury "start
  point" for a cycle — an explicit value at cycle-open time, or carried over
  from the previous cycle's closing balance, or `0` for the first cycle.
- The current balance is **computed on read**, not stored as a ledger:
  `opening + Σ(payment allocation amounts for this cycle, status COMPLETED)
  − Σ(expense amounts for this cycle, status RECORDED)`.
- `cycles.closingTreasuryBalanceMillimes` snapshots this computed value when
  the cycle is closed (`lib/domain/cycles/service#closeCycle`), and becomes
  the next cycle's default opening balance.
- No `BankAccount` or `TreasuryTransaction` entity exists. `Payment` and
  `Expense` carry no bank-account reference — they are just dated, amounted
  records; summing them per cycle *is* the treasury.

## Alternatives considered

- **Multi-account ledger with a cached balance per account** (the original
  design) — rejected: no discovered requirement or source-data evidence
  needs more than one running number, and building account CRUD, transfers,
  and manual adjustments for accounts that don't exist in the business today
  is exactly the premature complexity the project brief warns against.
  Revisit if a real multi-bank-account requirement appears (e.g. the syndic
  actually opens a second account) — the computed-total approach can be
  extended to sum per account without a schema rewrite of Payment/Expense,
  since the aggregation is already isolated in
  `lib/domain/cycles/service#getCycleTreasury`.
- **An append-only `treasuryTransactions` ledger even with one implicit
  account** — rejected as redundant: `Payment` and `Expense` are themselves
  already dated, amounted, append-only-by-convention records (never
  hard-deleted, see §04 Financial corrections); a parallel ledger collection
  summing the same facts a second time is duplicated state with a drift risk
  and no reporting benefit the source collections don't already provide.

## Consequences

- The treasury figure is always exactly consistent with the underlying
  Payment/Expense records, because it is computed from them directly rather
  than mirrored into a second collection — there is no cache to drift.
- Computing the balance costs one aggregation over `payments` and one over
  `expenses`, filtered by `cycleId` and status — cheap at the collection
  sizes this application operates at (§08 Performance), and it is the only
  place this computation lives (`getCycleTreasury`), so the dashboard and any
  future report call the same function rather than re-deriving it.
- Bank statement reconciliation (matching Résido's single running balance
  against an actual bank statement) is a manual, human-driven comparison in
  V1 — automated bank-feed reconciliation is not a discovered requirement.
- If a genuine multi-account need arises later, `Payment`/`Expense` would
  gain an optional account reference and `getCycleTreasury` would group by
  it — an additive change, not a redesign.
