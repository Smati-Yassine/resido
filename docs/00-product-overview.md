# 00 — Product Overview

## What Résido is

Résido is a production web application that replaces Excel-based bookkeeping for
condominium/syndic (homeowners' association) management. It manages the property
hierarchy (residence → building → lot), owners and ownership, custom billing
cycles, assessments (syndic charges), payments and receipts, expenses, and
treasury (bank/cash accounts), and produces financial reports and Excel exports.

Résido is **not** an Excel import/migration tool. Excel is a reference for
understanding the existing business, and later a one-way **export** target for
reporting. All data enters Résido through the application itself.

## Who uses it

- **Syndic administrators / accountants** — configure cycles, record payments and
  expenses, manage treasury, close cycles, generate reports.
- **Staff** — day-to-day data entry (payments, expenses) under supervision.
- **Owners** (future) — view their own balance, payment history, and receipts.
- **Super admins** — manage organizations (residences) and global configuration
  if Résido hosts multiple residences.

## Core domain concepts

| Concept | Meaning |
|---|---|
| Organization | A residence/syndic tenant. Owns all other data. |
| Building | A physical block within a residence (e.g. "Bloc A"). |
| Lot | A billable unit (apartment, commerce, storage). Has a surface. |
| Owner | A person or company who owns one or more lots. |
| Ownership | The relationship (and share) between an Owner and a Lot. |
| Cycle | A custom billing period (not necessarily a calendar year) during which assessments are due and treasury is tracked. |
| Assessment | The amount a Lot owes for a Cycle (the "syndic charge"). |
| Payment | Money received from an owner/payer, allocated across one or more assessments/lots. |
| Receipt | The numbered proof-of-payment document generated from a Payment. |
| Expense | Money spent by the syndic (salaries, utilities, maintenance, etc.). |
| BankAccount | A bank or cash account the syndic controls. |
| TreasuryTransaction | The ledger entry for every movement of money in or out of a BankAccount. |

## What V1 must get right

1. **Financial correctness** — the database is the only source of truth for
   money; nothing important is computed only in the browser.
2. **Custom cycles** — arbitrary start/end dates, not tied to the calendar year.
3. **Multi-lot, multi-cycle payments** — a single payment can cover several lots
   and, if needed, span quarters/columns the way the Excel sheets show.
4. **Auditability** — every financial mutation is traceable (who, when, before/after).
5. **Excel export** (not import) for lots, owners, payments, unpaid balances,
   expenses, treasury, and cycle reports.

## What V1 deliberately avoids

- Excel import/migration/reconciliation tooling.
- Microservices, event sourcing, CQRS, message queues, Kubernetes.
- Speculative features not implied by the Excel reference data or this design
  (e.g. complex proration engines) until a real requirement demands them.

See [01-excel-analysis.md](01-excel-analysis.md) for the business data this
design is grounded in, and [42](#) business-rule classification throughout the
other documents for what is confirmed vs. still an open decision.
