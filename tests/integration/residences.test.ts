import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import * as residences from "@/lib/domain/residences/service";
import { findResidenceByKey, normalizeAllSlugs } from "@/lib/domain/residences/repository";
import { findMembership } from "@/lib/domain/memberships/repository";
import * as users from "@/lib/domain/users/service";
import { ForbiddenError } from "@/lib/rbac/permissions";
import { setupTestDb, unwrap, newUserId, adminSession, residenceWithOpenCycle } from "./helpers";

setupTestDb();

describe("residences", () => {
  it("makes the creator SYNDIC_ADMIN of the new residence", async () => {
    const userId = newUserId();
    const residence = unwrap(await residences.createResidence(userId, { name: "Les Jasmins", city: "Sousse" }));
    expect(residence).toMatchObject({ name: "Les Jasmins", city: "Sousse", status: "ACTIVE" });
    expect(await findMembership(userId, residence.id)).toMatchObject({ role: "SYNDIC_ADMIN" });
  });

  it("rejects an empty name", async () => {
    const result = await residences.createResidence(newUserId(), { name: "  ", city: "" });
    expect(result.ok).toBe(false);
  });

  it("lists only the user's residences, with headline figures", async () => {
    const { userId, residence } = await residenceWithOpenCycle();
    await residences.createResidence(newUserId(), { name: "Someone else's", city: "" });

    const cards = await residences.listResidenceCards(userId);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: residence.id,
      lotCount: 3,
      blocCount: 2,
      currentCycle: { name: "2026", status: "OPEN" },
      collectionRate: 0,
    });
  });

  it("archives and restores without touching data", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    expect(unwrap(await residences.setResidenceArchived(session, residence.id, true)).status).toBe("ARCHIVED");
    expect(unwrap(await residences.setResidenceArchived(session, residence.id, false)).status).toBe("ACTIVE");
  });

  it("deletes a residence and every document scoped to it", async () => {
    const { session, residence } = await residenceWithOpenCycle();
    const other = unwrap(await residences.createResidence(newUserId(), { name: "Kept", city: "" }));

    unwrap(await residences.deleteResidence(session, residence.id));

    const db = await getDb();
    for (const name of [
      COLLECTIONS.lots,
      COLLECTIONS.buildings,
      COLLECTIONS.cycles,
      COLLECTIONS.assessments,
      COLLECTIONS.auditLogs,
    ]) {
      expect(await db.collection(name).countDocuments({}), name).toBe(0);
    }
    // Only the other residence and its creator's membership remain.
    expect(await db.collection(COLLECTIONS.organizations).countDocuments({})).toBe(1);
    expect(await db.collection(COLLECTIONS.memberships).countDocuments({})).toBe(1);
    expect(await residences.listResidenceCards(session.userId)).toHaveLength(0);
    expect(unwrap(await residences.getResidence(adminSession(other.id), other.id)).name).toBe("Kept");
  });

  it("refuses edits from a session scoped to another residence", async () => {
    const { residence } = await residenceWithOpenCycle();
    const intruder = adminSession(newUserId());
    await expect(residences.updateResidence(intruder, residence.id, { name: "Hacked" })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("users", () => {
  it("registers once per email and verifies the password", async () => {
    unwrap(await users.registerUser({ name: "Test User", email: "Test.User@Example.tn", password: "longenough" }));
    const duplicate = await users.registerUser({ name: "Other", email: "test.user@example.tn", password: "longenough" });
    expect(duplicate).toMatchObject({ ok: false, code: "EMAIL_TAKEN" });

    expect(await users.verifyCredentials({ email: "test.user@example.tn", password: "longenough" })).toMatchObject({
      name: "Test User",
    });
    expect(await users.verifyCredentials({ email: "test.user@example.tn", password: "wrong-password" })).toBeNull();
  });

  it("rejects short passwords", async () => {
    const result = await users.registerUser({ name: "A", email: "a@b.tn", password: "short" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("residence URLs (slugs)", () => {
  it("makes a clean slug from the name, numbering duplicates", async () => {
    const a = unwrap(await residences.createResidence(newUserId(), { name: "Résidence Les Jasmins", city: "" }));
    const b = unwrap(await residences.createResidence(newUserId(), { name: "Résidence les jasmins!", city: "" }));
    expect(a.slug).toBe("residence-les-jasmins");
    expect(b.slug).toBe("residence-les-jasmins-2");
  });

  it("changes the slug on rename and keeps the old one resolving (to redirect)", async () => {
    const userId = newUserId();
    const r = unwrap(await residences.createResidence(userId, { name: "Les Oliviers", city: "" }));
    const renamed = unwrap(await residences.updateResidence(adminSession(r.id, userId), r.id, { name: "Les Palmiers" }));
    expect(renamed.slug).toBe("les-palmiers");

    expect(await findResidenceByKey("les-palmiers")).toMatchObject({ canonical: true, residence: { id: r.id } });
    expect(await findResidenceByKey("les-oliviers")).toMatchObject({ canonical: false, residence: { id: r.id } });
    expect(await findResidenceByKey(r.id)).toMatchObject({ canonical: false, residence: { slug: "les-palmiers" } });
    expect(await findResidenceByKey("nothing-here")).toBeNull();

    // The freed slug is not handed to another residence, so old links never change target.
    const other = unwrap(await residences.createResidence(newUserId(), { name: "Les Oliviers", city: "" }));
    expect(other.slug).toBe("les-oliviers-2");
  });

  it("normalises legacy slugs", async () => {
    const r = unwrap(await residences.createResidence(newUserId(), { name: "Le Lac", city: "" }));
    const db = await getDb();
    await db.collection(COLLECTIONS.organizations).updateOne({ slug: r.slug }, { $set: { slug: "le-lac-3f2a1c" } });
    expect(await normalizeAllSlugs()).toEqual({ changed: 1 });
    expect(await findResidenceByKey("le-lac")).toMatchObject({ canonical: true });
    expect(await findResidenceByKey("le-lac-3f2a1c")).toMatchObject({ canonical: false });
  });
});
