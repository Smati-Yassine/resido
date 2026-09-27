# 07 — Authentication & Security

## Authentication

Auth.js (NextAuth) v5 on top of the App Router, credentials provider
(email + password, bcrypt/argon2 hashed) for V1, with the provider
architecture left open for adding SSO/magic-link later without a schema
change (`users.passwordHash` is already nullable for that reason).

Session strategy: JWT session cookie (httpOnly, secure, sameSite=lax)
carrying `{ userId, organizationId, role }`. No client-readable auth state
holds anything sensitive beyond what's needed for UI gating — every
server-side check re-derives permissions from the session, never trusts a
client-sent role/organizationId.

## Authorization (RBAC)

Roles (from the brief, all modeled, not all necessarily exposed in V1 UI):

```
SUPER_ADMIN   — cross-organization platform administration
SYNDIC_ADMIN  — full control within one organization, incl. cycle open/close
ACCOUNTANT    — financial data entry & reports, no cycle lifecycle actions
STAFF         — day-to-day data entry (payments, expenses), no deletes/reversals
OWNER         — portal access to their own lots/balance/receipts only
VIEWER        — read-only within an organization
```

Permissions are a static role→permission map in code
(`lib/rbac/permissions.ts`), e.g.:

```ts
const PERMISSIONS: Record<Role, Permission[]> = {
  SYNDIC_ADMIN: ["*"],
  ACCOUNTANT: ["payments:*", "expenses:*", "treasury:read", "reports:*", "lots:read", "owners:*"],
  STAFF: ["payments:create", "expenses:create", "lots:read", "owners:read"],
  OWNER: ["own:read"],
  VIEWER: ["*:read"],
  SUPER_ADMIN: ["platform:*"],
};
```

This is intentionally simple for V1 (§27: "do not assume every role is
required for V1; design permissions so they can evolve"). If custom
per-user overrides are later required, the evolution path is a
`permissionOverrides` array on `users` layered on top of the role map — not a
full ACL rebuild.

Every Server Action/Route Handler calls a single `requirePermission(session,
"payments:create")` guard before touching the domain layer; there is no
domain function that skips this check by being called from an unexpected
entry point, because the domain layer itself is only reachable from
guarded surfaces (enforced by the module structure in
[05](05-system-architecture.md), reviewed in code review, not currently by an
automated boundary linter — a candidate hardening item for Phase 9).

## Multi-tenant isolation

Covered in detail in [03-mongodb-architecture.md](03-mongodb-architecture.md)
§Multi-tenancy. Summary of the guarantee: **every** tenant-scoped repository
function requires `organizationId` as an explicit parameter sourced only from
the server-side session — never from client input — and it is the first key
of every relevant compound index, so cross-tenant queries are both
impossible by construction and fast by construction.

## Sensitive data handling

- **Bank account numbers**: only a masked/partial identifier is stored
  (`accountNumberMasked`, e.g. last 4 digits) — never a full account number,
  and never in any client-side bundle (`NEXT_PUBLIC_*` is never used for
  anything from the `bankAccounts` collection).
- **`MONGODB_URI`**: server-only environment variable, validated at boot
  (§06), never logged, never sent to the client, never committed (`.env.example`
  ships a placeholder only — see [12-deployment.md](12-deployment.md)).
- **Passwords**: hashed (argon2id) at rest, never logged, never included in
  audit log `before/after` snapshots.
- **PII** (owner phone/email/address): included in exports/reports because
  the product requires it (billing correspondence), but excluded from
  application logs and from audit-log metadata beyond what's needed to
  identify the entity (`entityId`, not full `before/after` dumps of PII
  fields where avoidable).

## Input validation & injection prevention

- All inputs validated with Zod before touching the database (§06).
- MongoDB driver's native BSON typing plus Zod-typed inputs prevent NoSQL
  injection (no raw string concatenation into query objects is used
  anywhere — query builders always construct typed filter objects from
  validated, narrow-typed fields).
- Next.js/React's default JSX escaping prevents XSS for rendered data;
  any place that must render user-supplied rich text (e.g. expense
  descriptions, notes) is treated as plain text, never `dangerouslySetInnerHTML`.
- CSRF: Server Actions have built-in origin-checking in Next.js; Route
  Handlers that accept mutations (rare — mostly export triggers) require the
  session cookie and re-check origin.

## Audit logging

See the `auditLogs` collection in [03](03-mongodb-architecture.md). Every
action in the list from the brief (§28) is written inside the same
transaction as the mutation it describes, so an audit entry can never be
missing for a financial write that succeeded. Audit entries are queryable
per organization, per entity, and are never editable or deletable through
the application API.

## Transport & infrastructure security

- HTTPS enforced end-to-end (TLS terminated at the CDN/reverse proxy,
  internal traffic to MongoDB Atlas over TLS).
- MongoDB Atlas network access restricted to the application's egress
  IPs/VPC peering; database users scoped with least-privilege roles (the
  application's DB user has readWrite on its own database only, no admin
  rights).
- Secrets (`MONGODB_URI`, `AUTH_SECRET`) managed via the hosting platform's
  secret manager (e.g. Vercel/hosting provider environment variables), never
  in source control.

## Security review — 2026-09-27

A pass over residence isolation and roles, ahead of real users.

**Holds up:**

- Every residence page, PDF and Excel export goes through
  `requireResidenceSession`: a residence the user is not a member of is a 404,
  indistinguishable from one that does not exist.
- Every server action derives its session from the residence named in the
  form, then the domain service checks the role (`requirePermission`) and the
  residence (`requireOrganization`).
- Every query and write on residence data filters on the residence
  (`organizationId`), so an id from another residence finds nothing. References
  inside a write (a lot's bloc and owners, a payment's charges) are checked to
  belong to the same residence; overpayment is checked against the database,
  not the client's figure.
- Members: only admins manage them; only the residence's creator makes or
  touches an admin; the creator cannot be removed or demoted. Roles are
  validated against a fixed list.
- Destructive account actions ask for the password; only the creator deletes
  a residence. No raw HTML rendering, no secrets exposed to the browser;
  passwords hashed with bcrypt; Next.js checks server actions' origin.

**Fixed in this pass:**

- Sign-in throttling (`lib/auth/rate-limit.ts`): 5 failures per email from one
  address, 30 per address, over 15 minutes, stored in MongoDB (serverless
  instances share no memory). Enforced in the credentials `authorize`, so the
  auth API cannot bypass it. Never per email alone, which would let anyone lock
  an account. Needs `npm run ensure-indexes` for its expiry index.
- An unknown email and a wrong password now take the same time to refuse.
- Security headers on every response: no framing by other sites
  (`frame-ancestors 'none'`, `X-Frame-Options`), `nosniff`, a referrer policy,
  camera / microphone / location off.
- Found by the end-to-end tests: the cycle menu's Open and Reopen did nothing
  (not a security issue, but a silent failure).

**Open — needs a product decision:**

- **Invitations are claimed by unverified email.** A pending invitation is
  granted to whoever signs up with that address, and sign-up does not check
  the address belongs to them. Someone who knows an invited email can register
  it first and get the residence. Options: verify email at sign-up (needs an
  email provider); or invitations as secret links the admin shares (WhatsApp,
  SMS) — no email needed; or an admin confirms each claimed invitation.
- A full script Content-Security-Policy (with nonces through Next's inline
  scripts) — worth doing, but carefully, as a wrong policy breaks the app.
- Sign-up says when an email already has an account (account enumeration);
  common and accepted for now.
