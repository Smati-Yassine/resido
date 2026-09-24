/**
 * Static role -> permission map. See docs/07-auth-security.md and
 * docs/decisions/ADR-009-authentication.md for the rationale (a static map
 * is deliberately simple for V1; per-user overrides are the documented
 * evolution path, not built until needed).
 */

export const ROLES = ["SUPER_ADMIN", "SYNDIC_ADMIN", "ACCOUNTANT", "STAFF", "OWNER", "VIEWER"] as const;

export type Role = (typeof ROLES)[number];

export type Permission =
  | "*"
  | "platform:*"
  | "payments:create"
  | "payments:read"
  | "payments:cancel"
  | "payments:*"
  | "expenses:create"
  | "expenses:read"
  | "expenses:cancel"
  | "expenses:*"
  | "treasury:read"
  | "treasury:*"
  | "cycles:read"
  | "cycles:manage"
  | "cycles:*"
  | "lots:read"
  | "lots:*"
  | "owners:read"
  | "owners:*"
  | "reports:read"
  | "reports:*"
  | "own:read";

const PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ["platform:*"],
  SYNDIC_ADMIN: ["*"],
  ACCOUNTANT: ["payments:*", "expenses:*", "treasury:read", "cycles:read", "reports:*", "lots:read", "owners:*"],
  STAFF: ["payments:create", "payments:read", "expenses:create", "expenses:read", "lots:read", "owners:read"],
  OWNER: ["own:read"],
  VIEWER: [
    "payments:read",
    "expenses:read",
    "treasury:read",
    "cycles:read",
    "lots:read",
    "owners:read",
    "reports:read",
  ],
};

function matches(granted: Permission, requested: Permission): boolean {
  if (granted === "*") return true;
  if (granted === requested) return true;
  const [grantedScope] = granted.split(":");
  const [requestedScope] = requested.split(":");
  return granted.endsWith(":*") && grantedScope === requestedScope;
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  const granted = PERMISSIONS[role] ?? [];
  return granted.some((g) => matches(g, permission));
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export interface AuthorizedSession {
  userId: string;
  organizationId: string | null;
  role: Role;
  status: "ACTIVE" | "DISABLED";
}

/**
 * Throws ForbiddenError unless the session's role grants `permission` AND
 * the session is ACTIVE. Every Server Action / Route Handler that touches
 * the domain layer calls this first — see docs/07-auth-security.md.
 */
export function requirePermission(session: AuthorizedSession, permission: Permission): void {
  if (session.status !== "ACTIVE") {
    throw new ForbiddenError(permission);
  }
  if (!roleHasPermission(session.role, permission)) {
    throw new ForbiddenError(permission);
  }
}

/**
 * Tenant-scoping guard: every domain call for a non-SUPER_ADMIN role must
 * carry a concrete organizationId matching the session's own organization.
 * See docs/03-mongodb-architecture.md #multi-tenancy and ADR-008.
 */
export function requireOrganization(session: AuthorizedSession, organizationId: string): void {
  if (session.role === "SUPER_ADMIN") return;
  if (session.organizationId !== organizationId) {
    throw new ForbiddenError("*");
  }
}
