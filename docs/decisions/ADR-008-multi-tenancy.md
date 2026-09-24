# ADR-008: Shared-database multi-tenancy with organizationId scoping

## Context

Résido may host multiple residences/syndics. §26 of the brief requires
designing for `Organization` from the start and guarantees no user can ever
access another organization's financial data.

## Decision

**Shared database, shared collections, row-level (`organizationId` field)
tenant isolation** — not database-per-tenant or collection-per-tenant.

- Every tenant-owned collection carries `organizationId: ObjectId`.
- Every compound index on a tenant collection leads with `organizationId`.
- Every repository function that reads/writes a tenant collection requires
  `organizationId` as an explicit parameter, sourced only from the
  server-side session (never client input) — there is no "unscoped" query
  function available to call by mistake.

## Alternatives considered

- **Database-per-tenant** — strongest isolation, but operationally heavy at
  the target scale (connection management, migrations, and backups
  multiplied per tenant) for no discovered compliance requirement demanding
  it; MongoDB Atlas project-level tooling isn't designed around thousands of
  per-tenant databases the way this pattern assumes. Revisit only if a
  specific enterprise customer requires physical data isolation.
- **Collection-per-tenant** — avoids nothing that field-level scoping
  doesn't already solve, while multiplying the number of collections/indexes
  Atlas has to manage and complicating cross-tenant platform admin queries
  (e.g. `SUPER_ADMIN` reporting) for no isolation benefit over a correctly
  enforced `organizationId` filter plus indexes.

## Consequences

- Isolation correctness depends entirely on disciplined application-layer
  scoping rather than physical separation — mitigated by: (a) TypeScript
  function signatures making `organizationId` a required parameter
  everywhere, (b) integration tests explicitly asserting cross-tenant
  queries return nothing (§11 Testing strategy), and (c) a Phase 9 security
  review specifically targeting this boundary.
- A single MongoDB cluster serves all tenants, keeping operational cost and
  complexity low at 1,000-user scale, with the option to shard by
  `organizationId` later if one cluster's capacity is ever exceeded — the
  schema's consistent `organizationId`-first indexing is already compatible
  with that path without a redesign.
