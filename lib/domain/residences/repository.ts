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
  /** Unique, URL-safe; kept from the organization model and generated from the name. */
  slug: string;
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

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "residence"}-${new ObjectId().toHexString().slice(-6)}`;
}

export async function insertResidence(
  input: { name: string; city: string; currency?: CurrencyCode },
  session: ClientSession,
): Promise<Residence> {
  const doc: ResidenceDoc = {
    _id: new ObjectId(),
    name: input.name,
    city: input.city,
    slug: slugify(input.name),
    status: "ACTIVE",
    settings: { currency: input.currency ?? DEFAULT_CURRENCY, timezone: "Africa/Tunis" },
    ...newTimestamps(),
  };
  await (await collection()).insertOne(doc, { session });
  return toDomain(doc);
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
  const result = await (
    await collection()
  ).findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toDomain(result) : null;
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
