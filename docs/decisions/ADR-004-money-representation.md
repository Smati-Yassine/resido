# ADR-004: Money as integer millimes, stored as BSON Long

## Context

Résido is a financial application handling Tunisian Dinar amounts to 3
decimal places (millimes: 1 TND = 1000 millimes). Floating-point arithmetic
(`0.1 + 0.2 !== 0.3`) must never be the authoritative representation of
money. The source Excel data itself already stores some monetary values as
integer millimes (e.g. `518880` = 518.880 TND in the receipts sheet),
independently validating this approach.

## Decision

- **Storage**: every money field is an integer number of millimes, stored in
  MongoDB as BSON `long` (`Int64`), never `double`.
- **Application layer**: a branded TypeScript type `Millimes = number &
  { __brand: "Millimes" }`. Millimes values in this system stay far below
  `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9×10^15) for any realistic condo
  finance figure (even a 100M-TND figure is only 10^11 millimes), so a
  branded `number` is safe and avoids the ergonomic cost of `bigint`
  (no native JSON support, awkward arithmetic operators) — while still
  being fully valid BSON `Long` at the driver boundary
  (`mongodb`'s `Long` type converts cleanly to/from a JS safe integer for
  values in this range).
- All arithmetic on money values is centralized in `lib/money` (see
  [04-financial-model.md](../04-financial-model.md)) — no `+`/`-`/`*`/`/`
  operator is used on a money value anywhere else in the codebase.
- Parsing user input (`"518.880"` → `518880`) and formatting for display
  (`518880` → `"518.880"`) are the only two conversion points, both in
  `lib/money`, both string-based (never via floating-point division/
  multiplication by 1000).

## Alternatives considered

- **JS `number` as decimal TND directly (e.g. `518.88`)** — rejected
  outright; this is exactly the floating-point money bug class the brief
  prohibits.
- **`Decimal128` for money** — MongoDB's `Decimal128` is precise, but adds
  a heavier, less ergonomic type at the application boundary (not a native
  JS numeric type; every arithmetic op requires a decimal library) for no
  benefit over integer millimes, which are already exact and fit safely in
  a JS number. `Decimal128` is used instead for `surfaceSqm` (§03), a
  genuinely fractional physical quantity, not money.
- **`bigint` at the application layer** — more "correct" in the abstract
  (unbounded precision) but adds real friction (no native `JSON.stringify`
  support, cannot mix with regular numbers without explicit casts) for a
  domain where safe-integer millimes already can never realistically
  overflow. Documented here so the decision can be revisited if Résido
  ever needs to represent currencies/amounts where this assumption breaks
  down.

## Consequences

- Every money field is unambiguous and exact; no rounding drift
  accumulates across allocations, reversals, or aggregation.
- UI money inputs must go through `<MoneyInput>` (§10), never a raw
  `<input type="number">` bound straight to a millimes field.
- Aggregation pipelines summing money fields (`$sum`) operate on `long`
  values and remain exact; results are still run through
  `lib/money#toDecimalString` before display.
- Any future multi-currency support would need this ADR revisited (rate
  conversion introduces genuine fractional math) — out of scope for V1,
  which is single-currency per organization (`organization.settings.currency`).
