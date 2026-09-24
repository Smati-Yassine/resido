# 14 — Development Roadmap

## Phase 0 — Design (this deliverable)

Excel analysis, domain model, MongoDB architecture, financial model, system
architecture, security, performance, UX, export strategy, ADRs. **No
application code.** Exit criteria: business owner confirms the Open Business
Decisions in [04-financial-model.md](04-financial-model.md).

## Phase 1 — Foundation

- Next.js + TypeScript + TailwindCSS project scaffold.
- MongoDB access layer: client singleton, repository pattern, `lib/env.ts`.
- Auth.js integration, session shape, RBAC guard (`requirePermission`).
- `lib/money`, `lib/validation` primitives.
- Testing setup: Vitest + `mongodb-memory-server`, Playwright scaffold.
- Base UI system: layout shell, `<DataTable>`, `<StatusBadge>`,
  `<MoneyInput>`, design tokens.
- `.env.example`, CI pipeline (type-check/lint/test/build).

## Phase 2 — Property Management

Organization settings, Buildings, Lots, Owners, Ownerships — full CRUD with
RBAC, list/search/filter UI, unit + integration tests for ownership
share-percent invariant.

## Phase 3 — Cycles & Assessments

Cycle CRUD (DRAFT/OPEN/CLOSED lifecycle), assessment generation on open
(SURFACE_BASED + MANUAL first, FIXED/PRORATED/EXCEPTIONAL scaffolded but
inert until a confirmed requirement), outstanding-balance derivation, cycle
close/reopen flows. **Blocked on** the Open Business Decisions in
[04-financial-model.md](04-financial-model.md) being confirmed.

## Phase 4 — Encaissements

Payment recording with multi-lot `<AllocationBuilder>`, receipt generation
with atomic counter, payment methods incl. structured check details,
cancellation/reversal flows, outstanding-balance/unpaid views, idempotency.

## Phase 5 — Expenses

Expense CRUD, configurable categories (seeded from Excel-derived defaults),
check details, attachments (object storage), cancellation/reversal.

## Phase 6 — Treasury

Bank accounts, treasury transactions (auto-generated from payments/expenses
+ manual adjustment/transfer), cached balance maintenance, account statement
view, reconciliation-oriented reporting.

## Phase 7 — Dashboard

Cycle/Encaissements/Dépenses/Trésorerie/Lots dashboard sections per §20,
backed by the aggregation strategy in
[08-performance-scalability.md](08-performance-scalability.md), with caching.

## Phase 8 — Excel Export

All seven export types from [09-excel-exports.md](09-excel-exports.md),
synchronous path first, background-job path for large exports.

## Phase 9 — Production Hardening

Full audit log coverage review, security review (penetration-test-style
pass on multi-tenant isolation and RBAC), load/performance testing against
the 1,000-concurrent-user target, observability wiring (§13), backup/restore
drill, complete E2E suite, production deployment runbook.

## Sequencing notes

- Phase 3 cannot meaningfully start until the cycle-closing and
  carry-forward business decisions are confirmed — building against
  unconfirmed assumptions risks a costly rework of the assessment/payment
  linkage.
- Phases 4–6 depend on Phase 3's Cycle/Assessment model but are otherwise
  independently implementable in parallel by separate workstreams if team
  size allows, since they touch distinct collections and only share the
  `treasuryTransactions` write path (already isolated behind
  `lib/domain/treasury`'s public API per [05](05-system-architecture.md)).
- Phase 8 (export) can start as soon as the underlying domain data exists for
  a given export (e.g. Lots/Owners export is buildable right after Phase 2),
  rather than strictly waiting for Phase 7.
