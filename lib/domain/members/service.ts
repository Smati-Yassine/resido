import { z } from "zod";
import type { AuthorizedSession, Role } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization, ForbiddenError } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { emailSchema } from "@/lib/validation/primitives";
import { writeAuditLog } from "@/lib/audit/log";
import * as memberships from "@/lib/domain/memberships/repository";
import * as invitations from "@/lib/domain/memberships/invitations";
import * as users from "@/lib/domain/users/service";

/**
 * Sharing a residence. An admin adds people by email with a role; an email
 * without an account becomes a pending invitation, claimed automatically at
 * sign-up. A residence always keeps at least one admin.
 */
export const SHAREABLE_ROLES = ["SYNDIC_ADMIN", "ACCOUNTANT", "VIEWER"] as const satisfies readonly Role[];
export type ShareableRole = (typeof SHAREABLE_ROLES)[number];

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(emailSchema),
  role: z.enum(SHAREABLE_ROLES),
});

export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "VALIDATION_ERROR" | "ALREADY_MEMBER" | "LAST_ADMIN" | "NOT_FOUND";
      message: string;
    };

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: Role;
  since: Date;
}

export interface MembersOverview {
  members: MemberView[];
  invitations: invitations.Invitation[];
}

export async function listMembers(session: AuthorizedSession, residenceId: string): Promise<Result<MembersOverview>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "cycles:read");
  const rows = await memberships.listMembers(residenceId);
  const people = new Map((await users.findUsersByIds(rows.map((r) => r.userId))).map((u) => [u.id, u]));
  return {
    ok: true,
    data: {
      members: rows.map((r) => ({
        userId: r.userId,
        name: people.get(r.userId)?.name ?? "—",
        email: people.get(r.userId)?.email ?? "",
        role: r.role,
        since: r.since,
      })),
      invitations: await invitations.listInvitationsForResidence(residenceId),
    },
  };
}

/** Adds an existing account right away, or leaves a pending invitation for a new email. */
export async function addMember(
  session: AuthorizedSession,
  residenceId: string,
  rawInput: { email: string; role: string },
): Promise<Result<{ kind: "added" | "invited"; email: string }>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  const parsed = addMemberSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "VALIDATION_ERROR", message: "Invalid email or role" };
  const { email, role } = parsed.data;

  const user = await users.findUserByEmail(email);
  if (!user) {
    const invitation = await invitations.upsertInvitation(residenceId, email, role, session.userId);
    await writeAuditLog({
      organizationId: residenceId,
      actorUserId: session.userId,
      action: "MEMBER_INVITED",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email, role },
    });
    return { ok: true, data: { kind: "invited", email } };
  }
  if (await memberships.findMembership(user.id, residenceId)) {
    return { ok: false, code: "ALREADY_MEMBER", message: "Already a member" };
  }
  await withTransaction(async (dbSession) => {
    await memberships.insertMembership({ userId: user.id, residenceId, role }, dbSession);
    await writeAuditLog(
      {
        organizationId: residenceId,
        actorUserId: session.userId,
        action: "MEMBER_ADDED",
        entityType: "membership",
        entityId: user.id,
        metadata: { email, name: user.name, role },
      },
      dbSession,
    );
  });
  return { ok: true, data: { kind: "added", email } };
}

async function isLastAdmin(residenceId: string, userId: string): Promise<boolean> {
  const admins = (await memberships.listMembers(residenceId)).filter((m) => m.role === "SYNDIC_ADMIN");
  return admins.length === 1 && admins[0].userId === userId;
}

export async function changeRole(
  session: AuthorizedSession,
  residenceId: string,
  userId: string,
  role: string,
): Promise<Result<{ role: ShareableRole }>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  const parsed = z.enum(SHAREABLE_ROLES).safeParse(role);
  if (!parsed.success) return { ok: false, code: "VALIDATION_ERROR", message: "Invalid role" };
  if (parsed.data !== "SYNDIC_ADMIN" && (await isLastAdmin(residenceId, userId))) {
    return { ok: false, code: "LAST_ADMIN", message: "A residence needs at least one admin" };
  }
  if (!(await memberships.setMemberRole(userId, residenceId, parsed.data))) {
    return { ok: false, code: "NOT_FOUND", message: "Member not found" };
  }
  await writeAuditLog({
    organizationId: residenceId,
    actorUserId: session.userId,
    action: "MEMBER_ROLE_CHANGED",
    entityType: "membership",
    entityId: userId,
    metadata: { role: parsed.data },
  });
  return { ok: true, data: { role: parsed.data } };
}

/** An admin removes someone, or any member removes themselves (leaves). */
export async function removeMember(
  session: AuthorizedSession,
  residenceId: string,
  userId: string,
): Promise<Result<null>> {
  requireOrganization(session, residenceId);
  if (userId !== session.userId) requirePermission(session, "*");
  if (await isLastAdmin(residenceId, userId)) {
    return { ok: false, code: "LAST_ADMIN", message: "A residence needs at least one admin" };
  }
  if (!(await memberships.findMembership(userId, residenceId)))
    return { ok: false, code: "NOT_FOUND", message: "Member not found" };
  await withTransaction(async (dbSession) => {
    await memberships.deleteMembership(userId, residenceId, dbSession);
    await writeAuditLog(
      {
        organizationId: residenceId,
        actorUserId: session.userId,
        action: "MEMBER_REMOVED",
        entityType: "membership",
        entityId: userId,
        metadata: { self: userId === session.userId },
      },
      dbSession,
    );
  });
  return { ok: true, data: null };
}

export async function cancelInvitation(
  session: AuthorizedSession,
  residenceId: string,
  invitationId: string,
): Promise<Result<null>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  if (!(await invitations.deleteInvitation(residenceId, invitationId))) {
    return { ok: false, code: "NOT_FOUND", message: "Invitation not found" };
  }
  await writeAuditLog({
    organizationId: residenceId,
    actorUserId: session.userId,
    action: "INVITATION_CANCELLED",
    entityType: "invitation",
    entityId: invitationId,
  });
  return { ok: true, data: null };
}

/**
 * Turns every pending invitation for this email into a membership. Called
 * right after registration and after an email change. Returns how many
 * residences were joined.
 */
export async function claimInvitations(userId: string, email: string): Promise<number> {
  const pending = await invitations.listInvitationsForEmail(email.trim().toLowerCase());
  let joined = 0;
  for (const invitation of pending) {
    await withTransaction(async (dbSession) => {
      if (!(await memberships.findMembership(userId, invitation.residenceId))) {
        await memberships.insertMembership(
          { userId, residenceId: invitation.residenceId, role: invitation.role },
          dbSession,
        );
        joined += 1;
      }
      await invitations.deleteInvitation(invitation.residenceId, invitation.id, dbSession);
    });
  }
  return joined;
}

/** Guard for callers that only need a boolean ("may this session manage members?"). */
export function canManageMembers(session: AuthorizedSession): boolean {
  try {
    requirePermission(session, "*");
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}
