# ADR-003: Native MongoDB driver + Zod, not Mongoose

## Context

Need a data-access approach balancing TypeScript safety, schema validation,
full access to MongoDB features (transactions, precise BSON types,
aggregation), maintainability, performance, and developer experience — not
chosen simply because it's popular (§5 of the brief explicitly warns
against that).

## Decision

Use the **official MongoDB Node.js driver** directly, with:

- **Zod** as the single source of runtime validation and the source of
  TypeScript types (`z.infer<typeof Schema>`), applied at every write
  boundary (Server Action, Route Handler, and again defensively inside the
  domain service).
- A thin **repository layer** (`lib/db/<collection>.ts`) wrapping raw driver
  calls with typed function signatures (`find`, `insertOne`,
  `findOneAndUpdate`, etc.), always requiring `organizationId`.
- MongoDB `$jsonSchema` collection validators mirroring the Zod schemas, as
  a database-level backstop independent of the application.

## Alternatives considered

### Option B: Mongoose

Rejected for this domain specifically, for concrete reasons:

- **Money precision risk**: Mongoose's `Number` type is a JS double by
  default; getting `Int64`/`Decimal128` money fields to round-trip
  correctly requires fighting the ODM's casting layer (custom SchemaTypes,
  careful `getters/setters`) rather than being the natural path — exactly
  the kind of subtle precision bug this application cannot afford
  (§6 of the brief).
- **Triplicated schema definition**: Mongoose schema + TypeScript interface
  + (still-needed) Zod validation for Server Action inputs would mean three
  places to keep in sync for every field. With Zod-only, the Zod schema
  *is* the TypeScript type and the validation rule, in one file.
- **Transaction ergonomics**: Mongoose sessions work, but layering
  Mongoose's own middleware/hooks (pre-save, virtuals) on top of
  multi-document transactional writes adds an extra layer of implicit
  behavior to reason about during financial writes, where predictability
  matters more than convenience sugar.
- **Overhead for features not needed**: Mongoose's populate/virtuals/
  discriminators solve problems (deep object-graph hydration) this domain
  mostly doesn't have — the reference-heavy schema here is intentionally
  designed for explicit, batched lookups (§08 Avoiding N+1), not automatic
  population.

### Option C: Prisma (with its Mongo connector) / other ODMs

Considered and rejected: Prisma's MongoDB support has historically lagged
its relational-database support (weaker transaction/aggregation-pipeline
ergonomics, less control over precise BSON types like `Long`), and
introduces a codegen step and its own query DSL to learn, without a benefit
over "native driver + Zod" for this domain's needs.

## Consequences

- More boilerplate per collection than Mongoose's declarative schema (a
  repository file + a Zod schema per collection) — accepted as the cost of
  full control over BSON types and transaction behavior.
- The team must maintain the `$jsonSchema` validators alongside the Zod
  schemas manually (no auto-sync) — mitigated by a small script/test that
  asserts both stay in structural agreement as part of CI.
- Full, un-abstracted access to the driver's transaction API
  (`client.startSession()` / `withTransaction()`), aggregation pipeline
  builder, and BSON types (`Long`, `Decimal128`) exactly where the
  financial model needs precision and control.
