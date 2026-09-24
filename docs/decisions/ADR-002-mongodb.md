# ADR-002: MongoDB as the database

## Context

The brief mandates MongoDB. This ADR documents why it fits the domain rather
than treating it as an unquestioned given, and states the modeling
consequences accepted by choosing it.

## Decision

Use MongoDB (Atlas, replica set) as the sole datastore, modeled around
domain entities and access patterns (§04 of the brief), not a 1:1 translation
of the Excel sheets or of what a relational schema would look like.

## Rationale

- The domain has a moderate number of loosely-coupled entity types (lots,
  owners, cycles, payments, expenses, treasury) with a handful of
  genuinely-embedded one-to-few relationships (payment allocations) and
  many one-to-many/reference relationships that are independently queried
  and paginated — MongoDB's document model fits this without forcing
  either "embed everything" or "normalize everything into 15 join tables."
- MongoDB's multi-document ACID transactions (available since 4.0 on a
  replica set, which Atlas provides by default) satisfy the financial
  consistency requirements (§29, §03 Transaction strategy) that used to be
  MongoDB's classic weakness relative to SQL — this gap no longer exists.
- Atomic `findOneAndUpdate` with `$inc` gives a genuinely simple,
  collision-free solution for the receipt-numbering requirement (§14),
  without a separate sequence mechanism.
- Aggregation pipelines are well-suited to the dashboard/reporting access
  patterns (§20, §35) without a separate OLAP system.
- Flexible schema (with `$jsonSchema` validators layered on for safety, see
  [ADR-003](ADR-003-mongodb-driver-vs-mongoose.md)) suits a domain that will
  evolve (new assessment methods, new expense categories, credit-balance
  entities) without heavyweight migrations for every additive field.

## Alternatives considered

- **PostgreSQL** — would also satisfy the transactional/relational needs
  well (arguably more "natively" relational for this domain), but was not
  the platform specified by the brief, and MongoDB's document model is not
  a poor fit here either — the reference/embed decisions in
  [03-mongodb-architecture.md](../03-mongodb-architecture.md) demonstrate a
  deliberate, justified design rather than a forced translation.

## Consequences

- The team must actively design (and review in PRs) reference-vs-embed
  decisions and index strategy per collection — MongoDB does not save this
  thinking the way a normalized SQL schema with foreign keys nudges toward
  a default. This is mitigated by documenting every collection's indexes
  and their justification centrally (§03/§08) rather than leaving it
  ad hoc.
- Cross-collection consistency (e.g. `assessments.paidMillimes` matching
  the sum of live payment allocations) is an application-maintained
  invariant, not a database-enforced foreign key + trigger — mitigated by
  funneling every write through the transaction-wrapped service layer
  (§03 Transaction strategy), never allowing ad hoc writes.
