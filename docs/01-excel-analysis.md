# 01 — Excel Analysis

Source files, read exhaustively cell-by-cell (values, formulas, number
formats, merged-cell layout) — not just skimmed:

- `.temp/Paiement Syndic H4 (Année 2025).xlsx` — 5 sheets
- `.temp/Paiement Syndic H4 (Année 2026).xlsx` — 1 sheet

This is a business reference only, never a schema source. Where a formula
made the underlying business rule explicit, it's quoted verbatim below —
that's stronger evidence than the static values alone.

## Sheet1 — "Paiement Syndic" (per-lot annual billing register, both files)

Columns: `Niveau` (block), `N°App` (lot code), `Superficie` (surface m²,
format `0.00`), `Syndic Annuel` (annual charge, format `0.000`),
`Acquéreur` (owner, free text), `Telephone`, `Trimestre 1..4`, `Reste`
(formula), `Mode de paiement`.

- **CONFIRMED** — `Syndic Annuel = Superficie × 8.000 TND/m²/year`, exact
  for every row in both years (Commerce 1: 151.22×8=1209.76; B51:
  300.01×8=2400.08). The rate is a cycle-scoped input, not a constant —
  identical across 2025/2026 here only because the syndic hadn't changed it.
- **CONFIRMED (formula-level)** — `Reste` is always `=E{row}-(H{row}+I{row}+J{row}+K{row})`,
  i.e. `annual − Σ(the four quarter cells)`. It is a derived spreadsheet
  formula in every single row of both years, never a typed-in value.
  Outstanding balance in Résido must be **computed**, never stored/edited.
- **CONFIRMED (formula-level)** — the four "Trimestre" columns are not four
  real due dates. Column K (labeled "Trimestre 4") is where the *entire*
  running paid-to-date amount is typed in, regardless of when it was
  actually paid: in the 2025 file, fully-paid lots have their whole annual
  amount in K with `Reste = 0`; in the 2026 file (captured mid-year), the
  *same* lots that are unpaid instead have `0` in K and the full annual
  amount lands in `Reste` via the identical formula. Columns H/I/J are
  never populated in either file. This is a human using one free-text slot
  as "amount paid so far," not a quarterly billing schedule — confirms the
  `Payment → PaymentAllocation → Assessment` model over any literal
  per-quarter field.
- **CONFIRMED** — a lot has exactly one `Acquéreur` cell, but the same name
  (or joint name, e.g. `"[Owner A] et [Owner B]"`, `"[Owner C] /
  [Owner D]"`, `"[Owner E] et [Owner F]"`) repeats across
  multiple lots and multiple cells contain two people. The business itself
  does **not** track an ownership percentage split for joint owners — it
  just writes both names in one cell. Résido's `Ownership` model supports
  percentage splits (a legitimate generalization for a system of record),
  but nothing in the source data requires defaulting every lot to a forced
  split; a single joint "Owner" record per cell, or an even 50/50 split, are
  both compatible with what's shown — this is a data-entry choice, not a
  schema gap.
- **CONFIRMED** — `Autre` / `intermeuble` rows have no surface and a
  manually set annual amount (5,789.025 in 2025 → 6,382.399 in 2026,
  `InterMeuble 2024`/`2025`/`2026` — one row per year, i.e. this is itself
  a small recurring assessment that changes cycle to cycle). Modeled as a
  `MANUAL`-calculation, surface-less lot (`COMMON_CHARGE` type).
- **CONFIRMED** — blocks: `RDC`, `Bloc A`, `Bloc B`, `Bloc C`, `Autre` — free
  text, not an enum; lot codes are `<Block><Floor><Unit>` or `Commerce N`.

## Sheet2 (2025 file only) — Receipt register

Columns: `Nom et prenom`, `Appartement`, `Recu`, `Montant`, `Manque`.

- **CONFIRMED** — receipts are sequentially numbered (`#1`...`#23` visible
  here) and one receipt can cover **multiple lots at once**: one
  owner's receipt `#21` lists `A21,A22,A31,A32,A41,A42` for a combined
  11,631.920 TND. Directly confirms `Payment → PaymentAllocation[]`.
- **CONFIRMED** — `Montant` is stored as an **integer in millimes already**
  (`518880` = 518.880 TND, `11631920` = 11,631.920 TND) — this is the
  business's own native representation, independently validating
  [ADR-004](decisions/ADR-004-money-representation.md).
- **CONFIRMED (formula-level)** — most rows have a duplicate-check cell
  (e.g. `D11 = (D10)`, `D16 = SUM(D14:D15)`) — a manual reconciliation
  habit, not a structural requirement.
- **INFERRED, now with stronger evidence** — receipt numbering scope.
  Sheet5 (below) references receipts up to at least `R:82` within the same
  2025 calendar year, i.e. numbering visibly continues well past the ~23
  rows shown in this register and does not appear to reset at any point
  observed within the year. There's no visibility into whether 2026 resets
  to `#1` (the 2026 file has no receipt register at all — see below), so
  this remains **BUSINESS DECISION REQUIRED** for the year boundary
  specifically, but the within-year evidence now more strongly supports
  the chosen default (continuous, `scope = "ALL"`, never per-period).
- **CONFIRMED** — the `Manque` (shortfall) column exists but is essentially
  unused (`Manque Total = SUM(F15)` where F15 is empty → always 0). Not a
  feature to build; outstanding-balance derivation already supersedes it.

## Sheet3 (2025 file only) — Monthly expense register (Jan–Sep 2025)

- **CONFIRMED** — itemized rows per month (label, amount, optional
  free-text check reference), each month closed by a `Somme = SUM(...)`
  formula row, and a final `TOTAL = SUM(all monthly Somme cells)` formula
  row (`=SUM(B15+B26+B37+B47+B57+B65+B72+B77+B82)`).
- **CONFIRMED** — recurring categories: concierge/cleaning salaries,
  elevator maintenance (`Rapide Ascenceur`), electricity (`Steg`), water
  (`Sonede`), cleaning products, notary/legal (`Huissier Notaire`), postal
  (`La Poste Tunisienne`) — seeds the default `ExpenseCategory` list.
- **CONFIRMED** — check references are unstructured free text mixing bank +
  number (`"Chèque BNA n° 1360626"`) — Résido structures this into
  `checkNumber`/`bank` fields.
- **CONFIRMED** — "one month = one block of rows in the same sheet," never
  a separate collection/tab per month — validates the explicit anti-pattern
  warning in the brief (§2/§3) and confirms `Expense.date` with a derived
  month, never a structural per-month entity.

## Sheet4 (2025 file only) — Bank reconciliation, formula-chained

```
D1: "Solde Banque BNA Aout 2024"      D3: 12,164.326  (opening balance)
2024:  Debit 31,149.441   Credit 38,232.400
2025:  Debit 42,119.412   Credit 29,338.855
TOTAL = D3 + J6 + J9 − F6 − F9 = 6,466.728        [formula: =(D3+B3+J6+J9-F6-F9)]

"Aout + Septembre" (a sub-period within 2025):
  Debit 6,092.500   Credit 1,854.400
  TOTAL = (previous TOTAL) + Credit − Debit = 2,228.628   [formula: =(F12+I20-D20)]
```

- **CONFIRMED, formula-level, and directly validates the current treasury
  design**: the running balance is computed as `previous total + credit −
  debit`, chained forward through successive periods (a full-year block,
  then a named sub-period building on that same total). This is *exactly*
  `openingTreasuryBalanceMillimes + income − expenses = closingTreasuryBalanceMillimes`,
  with the next period's opening being the prior period's closing — the
  model already implemented after the Phase 6 correction. No further change
  needed here; this sheet is strong independent confirmation.
- **CONFIRMED** — there is exactly **one** bank balance being tracked
  ("BNA"), never more than one account, never a transfer between accounts.
  Reconfirms there is no multi-account requirement in the source data.
- All monetary values here are also stored as integers in millimes
  (`12164326` = 12,164.326 TND) — same convention as Sheet2, reinforcing
  ADR-004 across the whole workbook, not just the receipts sheet.

## Sheet5 (2025 file, but its rows run into Jan–Jul 2026) — Combined running ledger

```
"Solde depart"              2,204.328
+ "Total Recette"          53,738.379   [=SUM(J4:J18)]
= "Total Recette + Solde depart"  55,942.707   [=J23+J25]
− "Total Depense"          51,834.733   [=SUM(G4:G45)]
= 4,107.974                             [=J27-J29]
```

- **CONFIRMED, formula-level** — identical pattern to Sheet4:
  `start + income − expenses = end`. Independently confirms the treasury
  model from a second, differently-structured sheet in the same workbook.
- **CONFIRMED — cycles are not calendar-year bound in actual practice.**
  This sheet lives inside the "2025" workbook but its expense/receipt rows
  are explicitly labeled into 2026 (`"janvier 2026"`, `"fevrier 2026"`,
  `"mars 2026"`, `"avril 2026"`, numbered entries through July `"53-...18/7"`).
  The syndic keeps working the *same* running ledger across the calendar
  boundary rather than starting a fresh sheet on January 1st. This is
  direct, concrete evidence for arbitrary (non-calendar-aligned) `Cycle`
  boundaries — already the design (`docs/decisions/ADR-005-cycle-model.md`)
  — and for carrying a cycle's closing balance into the next cycle's
  opening balance by default (already implemented).
- **CONFIRMED** — receipt references inside this sheet go at least to
  `R:82` (`"[Owner G] R:51"`, `"Dr [Owner H] R:82"`) — further supporting
  the continuous-numbering default noted under Sheet2.
- **OBSERVED, not required** — expense rows are informally numbered with a
  sequence prefix once the ledger gets long (`"44-Sonede 8/04"`,
  `"45-Rapid Ascenceur"`, `"47-COMETA 9/5"`...). This looks like a manual
  cross-reference convention, not a system requirement — nothing elsewhere
  reads or joins on this number. Résido's existing free-text
  `Expense.reference` field already accommodates it if a user wants to type
  it in; **not** worth a dedicated sequential-numbering feature (the same
  kind of unevidenced complexity already corrected once for treasury).
- The 2026 file itself has **no** equivalent expense/treasury sheet — one
  cell literally says `"Recette 2026: Voir Tableau"` ("see the [other]
  table"), i.e. the syndic kept using this 2025 file's Sheet5 for 2026
  bookkeeping rather than building a new one. Reinforces that period
  boundaries are informal and continuous in real usage, not a hard reset.

## Business rules extracted (classified, updated)

| Rule | Classification |
|---|---|
| Assessment = surface × configurable annual rate per m² | CONFIRMED (formula-level, every row) |
| Outstanding balance = Assessment amount − sum of valid payment allocations, always derived | CONFIRMED (formula-level) |
| A payment may cover multiple lots in one transaction | CONFIRMED |
| A receipt is generated per payment, sequentially numbered | CONFIRMED |
| Money must be tracked to the millime (3 decimals) | CONFIRMED (native representation across 3 different sheets) |
| Non-surface "Autre/Intermeuble" charges exist outside the per-lot surface formula, re-set each cycle | CONFIRMED |
| Expenses are categorized, dated, sometimes paid by check with a bank reference | CONFIRMED |
| Treasury = one running balance = opening + income − expenses, chained period to period | CONFIRMED (formula-level, two independent sheets) |
| Cycles are not calendar-year aligned in real usage; a period's closing balance carries into the next | CONFIRMED (direct evidence: Sheet5 spans a calendar-year boundary unbroken) |
| No multi-bank-account structure exists in practice | CONFIRMED (exactly one account tracked, "BNA") |
| Ownership percentage splits for joint owners are not tracked by the business today | CONFIRMED (joint names are a single free-text cell) |
| Expense sequential numbering is an informal habit, not a required feature | OBSERVED, not built |
| Receipt numbering resets per year vs. continues forever | **BUSINESS DECISION REQUIRED** — within-year evidence (numbers to ~82) supports the continuous default more strongly than before, but the year boundary itself is unobservable from these two files |
| Whether a payment can span multiple cycles (not just multiple lots) | **BUSINESS DECISION REQUIRED** — schema already supports it structurally |
| Whether the per-m² rate can vary by block/lot type within one cycle | **BUSINESS DECISION REQUIRED** — data shows one flat rate, no counter-example |
| Whether unpaid balances automatically carry forward into the next cycle as a new assessment line | **BUSINESS DECISION REQUIRED** |

These are carried through to [04-financial-model.md](04-financial-model.md)
§Open Business Decisions, which has been updated to reflect the stronger
evidence above.
