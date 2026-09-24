import type { Db, IndexSpecification, CreateIndexesOptions } from "mongodb";

export const COLLECTIONS = {
  organizations: "organizations",
  users: "users",
  memberships: "memberships",
  invitations: "invitations",
  buildings: "buildings",
  lots: "lots",
  owners: "owners",
  cycles: "cycles",
  assessments: "assessments",
  payments: "payments",
  expenses: "expenses",
  auditLogs: "auditLogs",
} as const;

interface IndexDef {
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}

/**
 * Index definitions matching docs/03-mongodb-architecture.md and
 * docs/08-performance-scalability.md exactly. Every index here is
 * justified by a documented query — see those files for the mapping.
 * Applied by scripts/ensure-indexes.ts (idempotent, safe to re-run).
 */
const INDEXES: Record<string, IndexDef[]> = {
  [COLLECTIONS.organizations]: [{ key: { slug: 1 }, options: { unique: true } }],
  // A user is global (one account, many residences); access to a residence
  // is a membership row — see lib/domain/memberships.
  [COLLECTIONS.users]: [{ key: { email: 1 }, options: { unique: true, name: "users_email_unique" } }],
  [COLLECTIONS.memberships]: [
    { key: { userId: 1, organizationId: 1 }, options: { unique: true } },
    { key: { organizationId: 1 } },
  ],
  [COLLECTIONS.invitations]: [
    { key: { organizationId: 1, email: 1 }, options: { unique: true } },
    { key: { email: 1 } },
  ],
  [COLLECTIONS.buildings]: [
    {
      key: { organizationId: 1, name: 1 },
      options: { unique: true, name: "buildings_name_unique_ci", collation: { locale: "fr", strength: 2 } },
    },
  ],
  [COLLECTIONS.lots]: [
    { key: { organizationId: 1, code: 1 }, options: { unique: true } },
    { key: { organizationId: 1, buildingId: 1 } },
    { key: { organizationId: 1, ownerId: 1 } },
  ],
  [COLLECTIONS.owners]: [{ key: { organizationId: 1, name: 1 } }],
  [COLLECTIONS.cycles]: [
    { key: { organizationId: 1, status: 1 }, options: { unique: true, partialFilterExpression: { status: "OPEN" } } },
    { key: { organizationId: 1, startDate: -1 } },
  ],
  [COLLECTIONS.assessments]: [
    { key: { organizationId: 1, cycleId: 1, lotId: 1 }, options: { unique: true } },
    { key: { organizationId: 1, lotId: 1, cycleId: -1 } },
    { key: { organizationId: 1, cycleId: 1, status: 1 } },
  ],
  [COLLECTIONS.payments]: [
    { key: { organizationId: 1, date: -1 } },
    { key: { organizationId: 1, "allocations.lotId": 1 } },
    { key: { organizationId: 1, idempotencyKey: 1 }, options: { unique: true } },
  ],
  [COLLECTIONS.expenses]: [
    { key: { organizationId: 1, date: -1 } },
    { key: { organizationId: 1, cycleId: 1, date: 1 } },
    { key: { organizationId: 1, idempotencyKey: 1 }, options: { unique: true } },
  ],
  [COLLECTIONS.auditLogs]: [
    { key: { organizationId: 1, createdAt: -1 } },
    { key: { organizationId: 1, entityType: 1, entityId: 1 } },
  ],
};

/**
 * Indexes from the pre-residence model (per-organization users, expense
 * categories, owners) that would clash with the definitions above on a
 * database created before that change.
 */
const LEGACY_INDEXES: Record<string, string[]> = {
  [COLLECTIONS.users]: ["organizationId_1_email_1", "email_1"],
  [COLLECTIONS.buildings]: ["organizationId_1_name_1"],
  [COLLECTIONS.expenses]: ["organizationId_1_cycleId_1_categoryId_1"],
  [COLLECTIONS.payments]: ["organizationId_1_payerOwnerId_1_date_-1"],
};

async function dropLegacyIndexes(db: Db): Promise<void> {
  for (const [collectionName, names] of Object.entries(LEGACY_INDEXES)) {
    const existing = await db
      .collection(collectionName)
      .indexes()
      .catch(() => []);
    for (const name of names) {
      if (existing.some((index) => index.name === name)) {
        await db.collection(collectionName).dropIndex(name);
      }
    }
  }
}

export async function ensureIndexes(db: Db): Promise<void> {
  await dropLegacyIndexes(db);
  for (const [collectionName, defs] of Object.entries(INDEXES)) {
    const collection = db.collection(collectionName);
    for (const def of defs) {
      await collection.createIndex(def.key, def.options);
    }
  }
}
