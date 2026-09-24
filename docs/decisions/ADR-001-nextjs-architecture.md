# ADR-001: Next.js App Router as the application architecture

## Context

Résido needs one cohesive web application serving both server-rendered
financial data (dashboards, lists, reports) and interactive forms
(payments, expenses, cycle management), targeting ~1,000 concurrent users,
with a hard constraint against unnecessary architectural complexity
(no microservices, no separate API service).

## Decision

Use Next.js with the **App Router**, React Server Components for reads,
Server Actions for mutations, and Route Handlers only where a true HTTP
endpoint is required (exports, health checks). Single deployable
application — a modular monolith (see
[05-system-architecture.md](../05-system-architecture.md)).

## Alternatives considered

- **Next.js Pages Router + separate REST/tRPC API layer** — adds an extra
  network hop and duplicated validation between client and API for no
  benefit at this scale; App Router's Server Actions already give
  type-safe, colocated mutations.
- **Separate backend (Express/Nest) + separate SPA frontend** — two
  deployables, two auth boundaries to keep in sync, no server rendering
  benefit; explicitly the kind of complexity the brief says to avoid at
  1,000 users.
- **Full microservices** — rejected outright per the brief's constraint;
  no discovered requirement justifies independent scaling/deployment of
  parts of this domain.

## Consequences

- Fast initial loads (RSC, no client-side fetch waterfall for the common
  read paths).
- Mutations and their validation live in one place (Server Action → Zod →
  domain service), reducing the chance of client/server validation drift.
- If a future requirement needs a public API (mobile app, partner
  integration), Route Handlers are already the established seam to expand
  from — no re-architecture needed, just additive endpoints.
- Ties the team to the Next.js App Router's conventions and its still-
  evolving caching model; mitigated by keeping the domain layer
  (`lib/domain/**`) framework-agnostic so it is not itself coupled to
  Next.js internals.
