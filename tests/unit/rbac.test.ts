import { describe, expect, it } from "vitest";
import {
  roleHasPermission,
  requirePermission,
  requireOrganization,
  ForbiddenError,
  type AuthorizedSession,
} from "@/lib/rbac/permissions";

function session(overrides: Partial<AuthorizedSession> = {}): AuthorizedSession {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role: "STAFF",
    status: "ACTIVE",
    ...overrides,
  };
}

describe("rbac: roleHasPermission", () => {
  it("SYNDIC_ADMIN has every permission via the wildcard", () => {
    expect(roleHasPermission("SYNDIC_ADMIN", "cycles:manage")).toBe(true);
    expect(roleHasPermission("SYNDIC_ADMIN", "payments:create")).toBe(true);
  });

  it("STAFF can create payments but cannot manage cycles", () => {
    expect(roleHasPermission("STAFF", "payments:create")).toBe(true);
    expect(roleHasPermission("STAFF", "cycles:manage")).toBe(false);
  });

  it("VIEWER has only read permissions", () => {
    expect(roleHasPermission("VIEWER", "payments:read")).toBe(true);
    expect(roleHasPermission("VIEWER", "payments:create")).toBe(false);
  });

  it("ACCOUNTANT has scoped wildcard access to payments and expenses", () => {
    expect(roleHasPermission("ACCOUNTANT", "payments:cancel")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "expenses:cancel")).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", "cycles:manage")).toBe(false);
  });

  it("OWNER is restricted to own:read", () => {
    expect(roleHasPermission("OWNER", "own:read")).toBe(true);
    expect(roleHasPermission("OWNER", "payments:read")).toBe(false);
  });
});

describe("rbac: requirePermission", () => {
  it("does not throw when the role grants the permission", () => {
    expect(() => requirePermission(session({ role: "STAFF" }), "payments:create")).not.toThrow();
  });

  it("throws ForbiddenError when the role lacks the permission", () => {
    expect(() => requirePermission(session({ role: "STAFF" }), "cycles:manage")).toThrow(ForbiddenError);
  });

  it("throws for a disabled user even if the role would otherwise grant it", () => {
    expect(() => requirePermission(session({ role: "SYNDIC_ADMIN", status: "DISABLED" }), "payments:create")).toThrow(
      ForbiddenError,
    );
  });
});

describe("rbac: requireOrganization (multi-tenant isolation)", () => {
  it("allows access to the session's own organization", () => {
    expect(() => requireOrganization(session({ organizationId: "org-1" }), "org-1")).not.toThrow();
  });

  it("rejects access to a different organization", () => {
    expect(() => requireOrganization(session({ organizationId: "org-1" }), "org-2")).toThrow(ForbiddenError);
  });

  it("SUPER_ADMIN bypasses the organization check", () => {
    expect(() => requireOrganization(session({ role: "SUPER_ADMIN", organizationId: null }), "org-2")).not.toThrow();
  });
});
