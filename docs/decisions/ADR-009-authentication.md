# ADR-009: Auth.js (NextAuth) with JWT sessions and a static RBAC map

## Context

Need authentication and role-based authorization (§27 of the brief) that
fits a Next.js App Router modular monolith, supports the listed roles, and
can evolve without assuming every role/permission is needed in V1.

## Decision

- **Auth.js (NextAuth) v5**, credentials provider (email + argon2id-hashed
  password) for V1.
- **JWT session strategy** (httpOnly, secure, sameSite cookie) carrying
  `{ userId, organizationId, role }` — no server-side session store needed
  for V1's scale, keeping the app stateless for horizontal scaling
  (§08 Performance).
- **Static role → permission map** in code (`lib/rbac/permissions.ts`), not
  a database-driven permissions/ACL system, for the roles in §27
  (`SUPER_ADMIN, SYNDIC_ADMIN, ACCOUNTANT, STAFF, OWNER, VIEWER`).

## Alternatives considered

- **Database-backed sessions** — gives instant revocation (kill a session
  server-side immediately) at the cost of a DB read on every request;
  deferred until proven necessary — JWT expiry kept short with refresh, and
  a `users.status: DISABLED` check enforced on every RBAC guard call
  provides effective-enough revocation (a disabled user's next request is
  rejected even with a still-valid JWT) without the per-request DB hit for
  the common case.
- **Third-party auth platform (Auth0/Clerk/etc.)** — viable, but adds an
  external dependency and cost for a capability (email/password + roles)
  Auth.js handles natively within the same codebase; reconsider if SSO/
  enterprise identity federation becomes a real customer requirement.
- **Database-driven fine-grained permissions from day one** — rejected per
  §27's explicit instruction not to assume every role/permission structure
  is required for V1; the static map is trivially replaceable by a
  `permissionOverrides` field on `users` layered on top later (documented
  in [07-auth-security.md](../07-auth-security.md)) without breaking the
  `requirePermission()` call sites that already exist.

## Consequences

- Role changes require a code deploy (acceptable for V1's fixed role set);
  per-user permission overrides are the documented evolution path if
  finer-grained control is later required.
- JWT payload must stay small and non-sensitive (ids + role only, no PII) —
  it is client-visible metadata (cookie), even though httpOnly prevents JS
  access; treated as semi-trusted, re-verified server-side on every guarded
  action regardless.
