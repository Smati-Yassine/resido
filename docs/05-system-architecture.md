# 05 — System Architecture

## High-level shape: modular monolith

```
Browser
   │  HTTPS
   ▼
Next.js (App Router, RSC + Server Actions + Route Handlers)
   │
   ├── UI layer (app/**, React Server/Client Components, Tailwind)
   │
   ├── Application/domain layer (lib/domain/**)
   │     ├── modules: property, owners, cycles, assessments,
   │     │            payments, receipts, expenses, treasury, audit, auth
   │     └── each module = service functions + Zod schemas + repository calls
   │
   ├── Data access layer (lib/db/**)
   │     └── MongoDB native driver client, one repository file per collection,
   │         every exported function requires organizationId
   │
   └── Cross-cutting: lib/money, lib/audit, lib/idempotency, lib/rbac
   │
   ▼
MongoDB (Atlas, replica set)
```

One deployable Next.js application. No microservices, no internal network
calls between "services" — module boundaries are enforced by folder structure,
import linting, and code review, not by process boundaries. This matches the
brief's explicit constraint (§44/§49): ~1,000 concurrent users does not
justify distributed-systems complexity.

## Module boundaries

Each domain module (`property`, `cycles`, `payments`, `treasury`, etc.)
exposes a narrow public API (a few exported functions) and keeps its Zod
schemas, business rules, and repository calls private to its folder. Modules
call each other's public APIs, never reach into each other's repositories
directly — e.g. the `payments` module calls `assessments.applyAllocation(...)`
rather than writing to the `assessments` collection itself. This keeps the
transaction-spanning logic (§03 Transaction strategy) in one place per
operation (typically a `*.orchestrator.ts` per financial write) instead of
scattered across modules.

```
lib/domain/payments/
  schema.ts        # Zod: CreatePaymentInput, Payment
  repository.ts     # private: payments collection CRUD
  service.ts         # recordPayment(), cancelPayment(), reversePayment()
  service.test.ts
```

## Rendering strategy

- **React Server Components** for all read-heavy pages (dashboard, lot list,
  payment history, reports) — data fetched directly from the domain layer on
  the server, no client-side data-fetching waterfall, no API round-trip for
  the initial render.
- **Server Actions** for mutations initiated from forms (record payment,
  create lot, close cycle) — colocated with the page, validated with the same
  Zod schema the domain layer uses, so client and server never validate
  differently.
- **Route Handlers** (`app/api/**`) only where a true HTTP endpoint is needed:
  Excel export downloads, webhooks (if any payment provider is added later),
  and any endpoint consumed by a non-browser client (e.g. a future mobile
  app or the owner portal's background export).
- **Client Components** only for interactive widgets (tables with client-side
  sort/filter, modals, charts) — kept as thin as possible, receiving
  server-fetched data as props rather than fetching themselves.

## Why not microservices / CQRS / event sourcing

- **Microservices** solve independent scaling and independent deployability
  for large teams/large traffic. At 1,000 concurrent users on one tenant-scale
  domain, a single Next.js process behind a load balancer with MongoDB
  connection pooling handles this comfortably (see
  [08-performance-scalability.md](08-performance-scalability.md)). Splitting
  now adds network calls, distributed transactions, and deployment overhead
  with no corresponding benefit.
- **Event sourcing / CQRS** would help if the audit trail needed to *replay*
  state or if read/write models diverged so far that they needed separate
  storage. Résido's audit requirement is satisfied by an append-only
  `auditLogs` collection alongside normal CRUD (§03), and the "read model"
  needs (dashboard aggregates) are satisfied by denormalized fields +
  aggregation pipelines on the same collections. Revisit only if reporting
  requirements grow dramatically (e.g. real-time analytics across thousands
  of organizations).

## Background work

A small set of operations should not block an HTTP request:

- Large Excel exports (full payment history, multi-year reports).
- Cycle-close report generation (once confirmed heavy).

**V1 approach**: run these as Next.js Route Handlers invoked asynchronously
with an in-process job queued via a lightweight, MongoDB-backed job
collection (`jobs`: `{ type, payload, status, resultUrl, organizationId,
createdAt }`), polled by the client for completion, with the actual work
executed by a Vercel/Node background function or a small worker process
reading from `jobs`. This avoids introducing Redis/BullMQ until volume
justifies it — see [ADR discussion in 08](08-performance-scalability.md).
If deployment is on a platform with hard request timeouts and job volume
grows, promote to a real queue (Redis + BullMQ) — the `jobs` collection
interface would not need to change from the caller's perspective.

## Directory layout (indicative)

```
app/
  (dashboard)/...          # authenticated app shell
  (public)/login/...
  api/exports/...           # Route Handlers for Excel export downloads
lib/
  domain/                   # see Module boundaries above
  db/                        # MongoDB client + repositories
  money/
  audit/
  rbac/
  validation/                # shared Zod primitives (Money, Cycle dates, ids)
components/
  ui/                         # design-system primitives
  <feature>/                  # feature-scoped client components
docs/
tests/
  unit/ integration/ e2e/
```
