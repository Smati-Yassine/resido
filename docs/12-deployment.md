# 12 — Deployment

## Production architecture

```
CDN / Reverse Proxy (TLS termination, static asset caching)
        │
        ▼
Next.js application (multiple stateless instances behind a load balancer)
        │
        ▼
MongoDB Atlas (replica set, dedicated tier sized for the org's data + 1,000
                concurrent user traffic)
        │
   ┌────┴─────┐
   ▼           ▼
Object storage   Background job runner
(export files,   (large export/report
 attachments)     generation — same
                   Next.js codebase,
                   invoked as a worker
                   process/function)
```

- **Hosting**: a platform with first-class Next.js support (Vercel, or a
  containerized deployment on any Node-capable host) — the app has no
  platform-specific dependency; App Router + Server Actions run anywhere
  Node.js 20+ runs.
- **MongoDB Atlas**: replica set (required for multi-document transactions),
  sized tier chosen from real load-testing data rather than guessed upfront;
  automated backups enabled (point-in-time recovery — non-negotiable for a
  financial system of record); IP allowlist/VPC peering restricting access to
  the application's network only (§07).
- **Object storage**: S3-compatible bucket for generated export files and
  expense attachments — never stored inside MongoDB documents (keeps
  documents small, keeps the database backup/restore fast).
- **Background job runner**: for V1, the same Next.js deployment handles
  background jobs (queued in the `jobs` collection, §05) via a scheduled/
  invoked function; promoted to a separate worker process only if job volume
  or duration outgrows the request-scoped execution model of the hosting
  platform.
- **Redis**: not deployed in V1 (§08); the architecture reserves the seam
  (rate limiting, caching, a real job queue) to add it later without
  redesigning the surrounding code.

## Environments

| Environment | Purpose | Database |
|---|---|---|
| Local development | `.env.local`, MongoDB via Docker Compose or a shared dev Atlas cluster | dev/test data only |
| Preview (per PR) | Automated preview deployments for review | isolated ephemeral or shared test database, never production data |
| Production | Live organizations | Atlas production cluster, backups on |

## Environment variables

`.env.example` (committed, placeholders only):

```env
MONGODB_URI=
MONGODB_DB=
AUTH_SECRET=
NODE_ENV=development
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_REGION=
```

Rules (§3/§38 of the brief, non-negotiable):

- `MONGODB_URI` is never hard-coded, never committed, never sent to the
  client, never prefixed `NEXT_PUBLIC_`.
- A test/staging MongoDB URI supplied during development is still treated as
  a secret — same handling as production.
- All environment variables are parsed through the Zod-validated `lib/env.ts`
  at process boot (§06); the app refuses to start with a missing/malformed
  `MONGODB_URI` rather than failing confusingly on first request.

## Release process

Standard CI gate before deploy: type-check → lint → unit tests → integration
tests → build. E2E tests run on the PR's preview deployment. Production
deploy is a promotion of a already-tested build artifact, not a rebuild from
a different commit than what was tested.

## Database migrations / schema evolution

MongoDB is schema-flexible, but Résido still needs controlled evolution for:
`$jsonSchema` validator changes, new required fields, and index changes. A
small migration runner (a `migrations/` folder of ordered, idempotent
scripts + a `migrations` collection tracking applied ones, run manually via a
CLI command as part of the release process) is used — no ORM-specific
migration tool is needed given the native-driver approach
([ADR-003](decisions/ADR-003-mongodb-driver-vs-mongoose.md)).

## Backups & disaster recovery

Atlas continuous backups with point-in-time recovery; a documented restore
drill (restore to a scratch cluster, verify a sample organization's balances
reconcile) is part of Phase 9 hardening, not deferred indefinitely given this
is a financial system of record.
