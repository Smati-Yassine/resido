# 08 — Performance & Scalability (target: ~1,000 concurrent users)

## What 1,000 concurrent users actually means here

Résido is an admin/financial tool, not a high-throughput consumer app: 1,000
concurrent *sessions* translate to a modest steady request rate (dashboard
polling, form submissions, list pages) with occasional bursts (cycle open,
month-end reporting). The design target is: **fast, indexed reads; correct,
transactional writes; no N+1 queries; no unbounded scans** — not distributed
horizontal scaling of a monolith.

## MongoDB connection pooling

- A single MongoDB `MongoClient` instance per Node.js process, created once
  and reused (never `new MongoClient()` per request) — Next.js's dev-mode hot
  reload is handled via the standard `global` caching pattern so the pool
  isn't recreated on every reload either.
- Pool size (`maxPoolSize`) tuned per deployment instance count so that
  `instances × maxPoolSize` stays within MongoDB Atlas's connection limit for
  the selected tier; started at `maxPoolSize: 20` per instance as a baseline,
  revisited from real connection-utilization metrics (§13 Observability).

## Query index strategy — mapping to real access patterns

Every index below is justified by a query this application actually runs
(no speculative indexes):

| Collection | Query | Index |
|---|---|---|
| lots | list active lots in a building | `{ organizationId: 1, buildingId: 1, status: 1 }` |
| lots | find lot by code (uniqueness + lookup) | `{ organizationId: 1, code: 1 }` unique |
| ownerships | current owners of a lot | `{ organizationId: 1, lotId: 1, endDate: 1 }` |
| ownerships | current lots of an owner | `{ organizationId: 1, ownerId: 1, endDate: 1 }` |
| cycles | the one OPEN cycle | `{ organizationId: 1, status: 1 }` unique partial on OPEN |
| assessments | unpaid/partial lots for the dashboard | `{ organizationId: 1, cycleId: 1, status: 1 }` |
| assessments | a lot's assessment history | `{ organizationId: 1, lotId: 1, cycleId: -1 }` |
| payments | recent payments list | `{ organizationId: 1, date: -1 }` |
| payments | a payer's payment history | `{ organizationId: 1, payerOwnerId: 1, date: -1 }` |
| payments | payments touching a given lot | `{ organizationId: 1, "allocations.lotId": 1 }` |
| payments | idempotency check | `{ organizationId: 1, idempotencyKey: 1 }` unique |
| receipts | receipt lookup/uniqueness | `{ organizationId: 1, number: 1 }` unique |
| expenses | recent expenses / date-range reports | `{ organizationId: 1, date: -1 }` |
| expenses | category breakdown per cycle | `{ organizationId: 1, cycleId: 1, categoryId: 1 }` |
| treasuryTransactions | bank account statement | `{ organizationId: 1, bankAccountId: 1, date: -1 }` |
| treasuryTransactions | cycle income/expense breakdown | `{ organizationId: 1, cycleId: 1, type: 1 }` |
| treasuryTransactions | traceability from source record | `{ organizationId: 1, sourceType: 1, sourceId: 1 }` |
| auditLogs | entity history | `{ organizationId: 1, entityType: 1, entityId: 1 }` |
| auditLogs | recent activity feed | `{ organizationId: 1, createdAt: -1 }` |

`organizationId` leads every compound index both for tenant-isolation
correctness (§03/§07) and because it is the highest-selectivity common
filter across all queries.

## Avoiding N+1 queries

- List pages that need related data (e.g. payments list showing lot codes)
  resolve it via a single `$lookup` aggregation stage or a batched
  `find({ _id: { $in: [...] } })` for referenced IDs collected from the page
  of results — never a per-row query in a loop.
- The domain/repository layer exposes batch-oriented read functions
  (`getLotsByIds`, `getOwnersByIds`) specifically so RSC pages compose one
  page-load's data needs into a fixed, small number of queries regardless of
  row count.

## Dashboard aggregation strategy

Dashboard values (§20 of the brief) are computed via targeted aggregation
pipelines scoped by `organizationId` + current cycle, reading mostly from the
denormalized fields already maintained transactionally (`assessments.status`,
`assessments.paidMillimes`, `bankAccounts.cachedBalanceMillimes`) so the
common-path dashboard load is cheap:

- **Lots paid/partial/unpaid/overdue**: single `$group` over `assessments`
  filtered by `cycleId`, grouping on `status` (+ a computed `overdue` flag
  from `dueDate < now`).
- **Collected/outstanding totals**: same aggregation, summing
  `paidMillimes`/`amountMillimes` — not a second pass over `payments`.
- **Treasury balance**: read directly from `bankAccounts.cachedBalanceMillimes`
  (O(1), no aggregation) summed across active accounts.
- **Payment trend / method breakdown**: a bounded aggregation over `payments`
  filtered to the current cycle's date range — small enough to run
  synchronously; a caching layer (see below) absorbs repeated dashboard loads.

## Caching

- Next.js RSC data fetches for dashboard aggregates use a short
  (`revalidate: 30–60s` or on-demand `revalidatePath` after a relevant
  mutation) cache — the dashboard does not need to reflect a payment within
  milliseconds, and this removes redundant aggregation work when many users
  view the same organization's dashboard concurrently.
- Nothing financial is cached in a way that could serve **stale data as
  authoritative for a write decision** — caching is strictly a read-path
  optimization; every mutation reads fresh, transactionally-consistent state.

## Background jobs for expensive work

Large Excel exports and cycle-close report generation run outside the request
path (§05) so they never hold an HTTP connection or a MongoDB transaction
open for the duration of a slow export.

## Horizontal scaling

The Next.js application is stateless (session in JWT cookie, no in-memory
state required across requests except the rate-limiter counters, which are
best-effort per-instance) and can run as multiple instances behind a load
balancer/CDN without any code change. MongoDB Atlas handles read scaling via
its own replica set; at this scale a single primary handles all writes
comfortably, with secondaries available for read-heavy reporting if ever
needed (not required at 1,000 users).

## What is explicitly deferred (not needed at this scale)

- Redis-backed caching/rate limiting (per-instance is sufficient until proven
  otherwise by real metrics).
- Read replicas / sharding.
- A dedicated queue/worker infrastructure beyond the MongoDB-backed `jobs`
  collection described in [05](05-system-architecture.md).
