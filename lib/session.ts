import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { findMembership } from "@/lib/domain/memberships/repository";
import { InvalidIdError } from "@/lib/db/ids";
import { findUserById } from "@/lib/domain/users/service";

export interface SignedInUser {
  userId: string;
  name: string;
  email: string;
}

/**
 * The signed-in user, or a redirect to the sign-in page. The account is
 * re-read from the database on every request, so a session is ended — not
 * trusted — once its account is deleted or its sessions were revoked
 * (sessionVersion bumped by a password change or "sign out everywhere"). Memoized per
 * request so a layout and its page share one lookup.
 */
export const requireUser = cache(async (): Promise<SignedInUser> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await getSignedInUser();
  // Deleted account, or its sessions were ended (password change, "sign out everywhere").
  if (!user) redirect("/api/session/end");
  return user;
});

/** Like requireUser, but returns null instead of redirecting (pages open to both, e.g. the 404). */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await findUserById(session.user.id).catch(() => null);
  if (!user || user.sessionVersion !== (session.user.sessionVersion ?? 0)) return null;
  return { userId: user.id, name: user.name, email: user.email };
});

/**
 * The one place a residence-scoped request derives its auth context from:
 * the residence id comes from the URL, the role from the user's membership.
 * A residence the user is not a member of is indistinguishable from one
 * that does not exist (404). See docs/07-auth-security.md.
 */
export const requireResidenceSession = cache(async (residenceId: string): Promise<AuthorizedSession> => {
  const user = await requireUser();
  let membership = null;
  try {
    membership = await findMembership(user.userId, residenceId);
  } catch (error) {
    if (!(error instanceof InvalidIdError)) throw error;
  }
  if (!membership) notFound();
  return { userId: user.userId, organizationId: residenceId, role: membership.role, status: "ACTIVE" };
});
