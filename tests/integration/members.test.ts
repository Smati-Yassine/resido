import { describe, expect, it } from "vitest";
import * as members from "@/lib/domain/members/service";
import * as users from "@/lib/domain/users/service";
import * as residences from "@/lib/domain/residences/service";
import * as account from "@/lib/domain/account/service";
import { findMembership } from "@/lib/domain/memberships/repository";
import { listAuditLog } from "@/lib/audit/log";
import { ForbiddenError } from "@/lib/rbac/permissions";
import { setupTestDb, unwrap, key, residenceWithOpenCycle } from "./helpers";

setupTestDb();

const register = async (name: string) =>
  unwrap(await users.registerUser({ name, email: `${key()}@test.tn`, password: "long-password" }));

describe("members", () => {
  it("adds an existing account straight away with the chosen role", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const colleague = await register("Colleague");
    const added = unwrap(
      await members.addMember(session, residence.id, { email: colleague.email.toUpperCase(), role: "ACCOUNTANT" }),
    );
    expect(added.kind).toBe("added");
    expect(await findMembership(colleague.id, residence.id)).toMatchObject({ role: "ACCOUNTANT" });
    expect(await members.addMember(session, residence.id, { email: colleague.email, role: "VIEWER" })).toMatchObject({
      ok: false,
      code: "ALREADY_MEMBER",
    });
    const cards = await residences.listResidenceCards(colleague.id);
    expect(cards.map((c) => [c.name, c.role])).toEqual([["Résidence Test", "ACCOUNTANT"]]);
  });

  it("keeps an invitation for an unknown email and turns it into a membership at sign-up", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const email = `${key()}@later.tn`;
    expect(unwrap(await members.addMember(session, residence.id, { email, role: "VIEWER" })).kind).toBe("invited");
    expect(unwrap(await members.listMembers(session, residence.id)).invitations.map((i) => i.email)).toEqual([email]);

    const newcomer = unwrap(await users.registerUser({ name: "Newcomer", email, password: "long-password" }));
    expect(await members.claimInvitations(newcomer.id, newcomer.email)).toBe(1);
    expect(await findMembership(newcomer.id, residence.id)).toMatchObject({ role: "VIEWER" });
    expect(unwrap(await members.listMembers(session, residence.id)).invitations).toEqual([]);
  });

  it("never leaves a residence without an admin", async () => {
    const { session, residence, userId } = await residenceWithOpenCycle();
    expect(await members.changeRole(session, residence.id, userId, "VIEWER")).toMatchObject({
      ok: false,
      code: "LAST_ADMIN",
    });
    expect(await members.removeMember(session, residence.id, userId)).toMatchObject({ ok: false, code: "LAST_ADMIN" });

    const colleague = await register("Second admin");
    unwrap(await members.addMember(session, residence.id, { email: colleague.email, role: "SYNDIC_ADMIN" }));
    unwrap(await members.changeRole(session, residence.id, userId, "VIEWER"));
  });

  it("lets non-admins view and leave, but not manage", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const viewer = await register("Viewer");
    unwrap(await members.addMember(session, residence.id, { email: viewer.email, role: "VIEWER" }));
    const viewerSession = {
      userId: viewer.id,
      organizationId: residence.id,
      role: "VIEWER" as const,
      status: "ACTIVE" as const,
    };

    expect(unwrap(await members.listMembers(viewerSession, residence.id)).members).toHaveLength(2);
    await expect(members.addMember(viewerSession, residence.id, { email: "x@y.tn", role: "VIEWER" })).rejects.toThrow(
      ForbiddenError,
    );
    await expect(members.removeMember(viewerSession, residence.id, session.userId)).rejects.toThrow(ForbiddenError);
    unwrap(await members.removeMember(viewerSession, residence.id, viewer.id));
    expect(await findMembership(viewer.id, residence.id)).toBeNull();
  });

  it("hands admin to another member when the only admin deletes their account", async () => {
    const owner = await register("Owner");
    const residence = unwrap(await residences.createResidence(owner.id, { name: "Shared", city: "" }));
    const session = {
      userId: owner.id,
      organizationId: residence.id,
      role: "SYNDIC_ADMIN" as const,
      status: "ACTIVE" as const,
    };
    const helper = await register("Helper");
    unwrap(await members.addMember(session, residence.id, { email: helper.email, role: "ACCOUNTANT" }));

    unwrap(await account.deleteAccount(owner.id, "long-password"));
    expect(await findMembership(helper.id, residence.id)).toMatchObject({ role: "SYNDIC_ADMIN" });
  });

  it("records member changes in the activity log", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    await members.addMember(session, residence.id, { email: `${key()}@later.tn`, role: "VIEWER" });
    const actions = (await listAuditLog(residence.id)).map((e) => e.action);
    expect(actions).toContain("MEMBER_INVITED");
    expect(actions).toContain("LOT_CREATED");
    expect(actions).toContain("CYCLE_OPENED");
  });
});

describe("account security", () => {
  it("changes the email only with the password, and never onto a taken one", async () => {
    const user = await register("Me");
    const other = await register("Other");
    expect(await users.updateProfile(user.id, { name: "Me", email: "new@me.tn" })).toMatchObject({
      code: "WRONG_PASSWORD",
    });
    expect(
      await users.updateProfile(user.id, { name: "Me", email: other.email, password: "long-password" }),
    ).toMatchObject({
      code: "EMAIL_TAKEN",
    });
    expect(
      unwrap(await users.updateProfile(user.id, { name: "Renamed", email: "new@me.tn", password: "long-password" })),
    ).toMatchObject({
      name: "Renamed",
      email: "new@me.tn",
    });
    // Renaming alone needs no password.
    expect(unwrap(await users.updateProfile(user.id, { name: "Again", email: "new@me.tn" })).name).toBe("Again");
  });

  it("revokes existing sessions on password change and on 'sign out everywhere'", async () => {
    const user = await register("Me");
    expect(user.sessionVersion).toBe(0);
    expect(await users.changePassword(user.id, "wrong", "another-password")).toMatchObject({ code: "WRONG_PASSWORD" });
    expect(await users.changePassword(user.id, "long-password", "short")).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(unwrap(await users.changePassword(user.id, "long-password", "another-password")).sessionVersion).toBe(1);
    expect(await users.verifyCredentials({ email: user.email, password: "another-password" })).not.toBeNull();
    await users.endAllSessions(user.id);
    expect((await users.findUserById(user.id))?.sessionVersion).toBe(2);
  });
});
