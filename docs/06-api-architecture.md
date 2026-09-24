# 06 — API Architecture

## Surface types

| Surface | Used for | Validation |
|---|---|---|
| Server Actions | All mutations triggered from the app's own forms (record payment, create lot, close cycle, edit owner…) | Zod schema shared with the domain service; re-validated server-side even though the form also validates client-side |
| Route Handlers (`app/api/**`) | Excel export downloads, any future external/webhook consumer | Zod on query/body; auth via session cookie or API key (external) |
| React Server Components (direct calls) | All reads for page rendering | Same repository/service functions as everything else — RSC calls `lib/domain/*` directly, no internal HTTP hop |

There is deliberately **no general-purpose public REST/GraphQL API** in V1 —
the brief does not require one, and building one "just in case" would be the
premature complexity the design explicitly avoids. If a mobile app or partner
integration becomes a real requirement, Route Handlers already exist as the
seam to expand from.

## Request flow for a mutation (example: record a payment)

1. Browser submits a form bound to a Server Action `recordPayment(input)`.
2. Server Action: reads the session (→ `organizationId`, `userId`, `role`),
   checks RBAC permission (`payments:create`), parses `input` with
   `CreatePaymentInputSchema` (Zod).
3. Delegates to `lib/domain/payments/service.ts#recordPayment(orgId, userId, input)`.
4. Service opens a MongoDB session/transaction, performs the writes in
   [03](03-mongodb-architecture.md) §Transaction strategy, commits.
5. Service returns a typed result; Server Action revalidates the affected
   paths (`revalidatePath`) so RSC pages reflect the new data on next
   navigation, and returns success/error to the form.
6. Every step 2–4 failure returns a typed `{ ok: false, error }` shape — the
   UI never receives a raw exception/stack trace.

## Validation with Zod

- One Zod schema per domain input, colocated with its module (`schema.ts`).
- `z.infer<typeof Schema>` is the TypeScript type used everywhere for that
  input — no hand-duplicated interface.
- Environment variables validated once at boot via a `lib/env.ts` that parses
  `process.env` through a Zod schema and throws on startup if misconfigured
  (fails fast rather than surfacing a broken `MONGODB_URI` at request time).
- Money fields in Zod schemas use a custom `millimesSchema` that only accepts
  a non-negative safe integer (or a decimal-string input transformed via
  `lib/money#fromDecimalString`), rejecting floats outright.
- Client-side TypeScript types are **never** trusted as validation — every
  Server Action and Route Handler re-parses its input with the same Zod
  schema regardless of what the client claims to have already validated.

## Error handling & typed results

Domain services return a discriminated union rather than throwing for
*expected* business errors (insufficient assessment balance, cycle not open,
duplicate idempotency key):

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: "CYCLE_NOT_OPEN" | "ALLOCATION_EXCEEDS_BALANCE" | "DUPLICATE_REQUEST" | ...; message: string };
```

Unexpected errors (DB connectivity, programming bugs) still throw and are
caught by Next.js error boundaries / logged to the observability stack (see
[13-observability.md](13-observability.md)) — they are not modeled as
business `Result` variants.

## Pagination & filtering

All list endpoints (payments, expenses, lots, treasury transactions, audit
log) use cursor-based pagination on an indexed, monotonic field
(`_id` or `date` + `_id` tiebreaker), not `skip/limit`, to stay performant as
collections grow — `skip` degrades linearly with offset and is avoided past
the first page. Filters (date range, status, category, lot, owner) map
directly to indexed query fields documented per-collection in
[03](03-mongodb-architecture.md) and [08](08-performance-scalability.md).

## Rate limiting

Applied at the Route Handler / Server Action boundary for financially
sensitive or expensive operations (payment/expense creation, export
generation, login) via a simple sliding-window counter keyed by
`organizationId + userId` (and by IP for unauthenticated login attempts),
backed by an in-memory store per instance for V1's traffic level, with a note
to move to a shared store (Redis) only if horizontal scaling makes per-instance
limits ineffective (see [08](08-performance-scalability.md)).
