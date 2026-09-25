import { ObjectId, type ClientSession } from "mongodb";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId, toObjectId } from "@/lib/db/ids";
import { newTimestamps } from "@/lib/db/timestamps";
import type { Residence, ResidenceStatus } from "./schema";
import { DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from "@/lib/currency";

interface ResidenceDoc {
  _id: ObjectId;
  name: string;
  city: string;
  /** Unique URL key made from the name ("les-jasmins", "les-jasmins-2"). */
  slug: string;
  /** Slugs the residence had before a rename, so old links still resolve (and redirect). */
  oldSlugs?: string[];
  status: ResidenceStatus;
  settings: { currency: string; timezone: string };
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(doc: ResidenceDoc): Residence {
  return {
    id: fromObjectId(doc._id),
    name: doc.name,
    city: doc.city ?? "",
    slug: doc.slug,
    status: doc.status,
    currency: isCurrencyCode(doc.settings?.currency) ? doc.settings.currency : DEFAULT_CURRENCY,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<ResidenceDoc>(COLLECTIONS.organizations);
}

/** "Résidence Les Jasmins" → "residence-les-jasmins". */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || "residence";
}

/**
 * The first free slug for `name`: the plain slug, else "-2", "-3"… Slugs are
 * global (the URL holds no owner), and a slug another residence used before a
 * rename stays reserved so its old links keep pointing to it.
 */
async function uniqueSlug(name: string, excludeId?: ObjectId): Promise<string> {
  const base = slugify(name);
  const taken = new Set<string>();
  const docs = await (await collection())
    .find(
      {
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        $or: [{ slug: { $regex: `^${base}(-\\d+)?$` } }, { oldSlugs: { $regex: `^${base}(-\\d+)?$` } }],
      },
      { projection: { slug: 1, oldSlugs: 1 } },
    )
    .toArray();
  for (const doc of docs) {
    taken.add(doc.slug);
    for (const old of doc.oldSlugs ?? []) taken.add(old);
  }
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

export async function insertResidence(
  input: { name: string; city: string; currency?: CurrencyCode },
  session: ClientSession,
): Promise<Residence> {
  const doc: ResidenceDoc = {
    _id: new ObjectId(),
    name: input.name,
    city: input.city,
    slug: await uniqueSlug(input.name),
    status: "ACTIVE",
    settings: { currency: input.currency ?? DEFAULT_CURRENCY, timezone: "Africa/Tunis" },
    ...newTimestamps(),
  };
  await (await collection()).insertOne(doc, { session });
  return toDomain(doc);
}

/**
 * Resolves the key in a residence URL: its current slug, an old slug (renamed
 * since) or, for links made before slugs, its id. `canonical` is false when
 * the URL should be redirected to the current slug.
 */
export async function findResidenceByKey(key: string): Promise<{ residence: Residence; canonical: boolean } | null> {
  const residences = await collection();
  const current = await residences.findOne({ slug: key });
  if (current) return { residence: toDomain(current), canonical: true };
  const renamed = await residences.findOne({ oldSlugs: key });
  if (renamed) return { residence: toDomain(renamed), canonical: false };
  if (ObjectId.isValid(key) && /^[0-9a-f]{24}$/i.test(key)) {
    const byId = await residences.findOne({ _id: new ObjectId(key) });
    if (byId) return { residence: toDomain(byId), canonical: false };
  }
  return null;
}

export async function findResidenceById(id: string): Promise<Residence | null> {
  const doc = await (await collection()).findOne({ _id: toObjectId(id) });
  return doc ? toDomain(doc) : null;
}

export async function findResidencesByIds(ids: string[]): Promise<Residence[]> {
  if (ids.length === 0) return [];
  const docs = await (
    await collection()
  )
    .find({ _id: { $in: ids.map(toObjectId) } })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toDomain);
}

export async function updateResidence(
  id: string,
  patch: Partial<{ name: string; city: string; status: ResidenceStatus }>,
): Promise<Residence | null> {
  const residences = await collection();
  const _id = toObjectId(id);
  const existing = await residences.findOne({ _id });
  if (!existing) return null;
  const update: { $set: Record<string, unknown>; $addToSet?: Record<string, unknown> } = {
    $set: { ...patch, updatedAt: new Date() },
  };
  // A new name gets a new slug; the old one is kept so existing links redirect.
  if (patch.name !== undefined && slugify(patch.name) !== slugify(existing.name)) {
    update.$set.slug = await uniqueSlug(patch.name, _id);
    update.$addToSet = { oldSlugs: existing.slug };
  }
  const result = await residences.findOneAndUpdate({ _id }, update, { returnDocument: "after" });
  return result ? toDomain(result) : null;
}

/** One-off normalisation: gives every residence the clean slug of its name (old slug kept for redirects). */
export async function normalizeAllSlugs(): Promise<{ changed: number }> {
  const residences = await collection();
  let changed = 0;
  for (const doc of await residences.find({}, { projection: { name: 1, slug: 1 } }).sort({ createdAt: 1 }).toArray()) {
    const wanted = await uniqueSlug(doc.name, doc._id);
    if (wanted === doc.slug) continue;
    await residences.updateOne(
      { _id: doc._id },
      { $set: { slug: wanted }, ...(doc.slug ? { $addToSet: { oldSlugs: doc.slug } } : {}) },
    );
    changed += 1;
  }
  return { changed };
}

/**
 * Whether every stored amount of the residence can be written with `decimals`
 * decimals — i.e. switching to a currency with fewer decimals than TND would
 * not leave amounts that can no longer be displayed or typed exactly.
 */
export async function amountsFitDecimals(id: string, decimals: number): Promise<boolean> {
  const step = 10 ** (3 - decimals);
  if (step === 1) return true;
  const db = await getDb();
  const organizationId = toObjectId(id);
  const offCents = (field: string) => ({ [field]: { $type: "number", $not: { $mod: [step, 0] } } });
  const checks: [string, Record<string, unknown>][] = [
    [COLLECTIONS.lots, offCents("chargeMillimes")],
    [COLLECTIONS.assessments, { $or: [offCents("amountMillimes"), offCents("paidMillimes")] }],
    [COLLECTIONS.payments, { $or: [offCents("amountMillimes"), offCents("allocations.amountMillimes")] }],
    [COLLECTIONS.expenses, offCents("amountMillimes")],
    [
      COLLECTIONS.cycles,
      { $or: [offCents("openingTreasuryBalanceMillimes"), offCents("closingTreasuryBalanceMillimes")] },
    ],
  ];
  for (const [collection, filter] of checks) {
    if (await db.collection(collection).findOne({ organizationId, ...filter }, { projection: { _id: 1 } }))
      return false;
  }
  return true;
}

export async function setResidenceCurrency(id: string, currency: CurrencyCode): Promise<Residence | null> {
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { "settings.currency": currency, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toDomain(result) : null;
}

/** Tenant-scoped collections wiped when a residence is deleted. */
const TENANT_COLLECTIONS = [
  COLLECTIONS.memberships,
  COLLECTIONS.invitations,
  COLLECTIONS.buildings,
  COLLECTIONS.lots,
  COLLECTIONS.owners,
  COLLECTIONS.cycles,
  COLLECTIONS.assessments,
  COLLECTIONS.payments,
  COLLECTIONS.expenses,
  COLLECTIONS.auditLogs,
] as const;

export async function deleteResidenceCascade(id: string, session: ClientSession): Promise<boolean> {
  const db = await getDb();
  const organizationId = toObjectId(id);
  for (const name of TENANT_COLLECTIONS) {
    await db.collection(name).deleteMany({ organizationId }, { session });
  }
  const result = await db.collection(COLLECTIONS.organizations).deleteOne({ _id: organizationId }, { session });
  return result.deletedCount === 1;
}
