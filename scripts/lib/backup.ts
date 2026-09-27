import fs from "node:fs";
import path from "node:path";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { BSON, type Db, type Document } from "mongodb";
import { COLLECTIONS, ensureIndexes } from "@/lib/db/collections";

const { EJSON } = BSON;

/**
 * A logical backup of Résido's database: one gzipped file per collection,
 * one document per line in Extended JSON (ids, dates and numbers keep their
 * exact types), and a manifest with the counts. Independent of the host's own
 * backups (Atlas point-in-time recovery stays the first line): a copy you hold,
 * and the material of the restore drill (docs/runbook.md).
 */

export interface Manifest {
  createdAt: string;
  database: string;
  counts: Record<string, number>;
}

/** Collections worth keeping: every app collection but short-lived sign-in failures. */
const KEPT = Object.values(COLLECTIONS).filter((name) => name !== COLLECTIONS.loginFailures);

export async function backup(db: Db, dir: string): Promise<Manifest> {
  fs.mkdirSync(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const name of KEPT) {
    let count = 0;
    const lines = async function* () {
      for await (const doc of db.collection(name).find({}, { sort: { _id: 1 } })) {
        count += 1;
        yield EJSON.stringify(doc, { relaxed: false }) + "\n";
      }
    };
    await pipeline(Readable.from(lines()), createGzip(), fs.createWriteStream(path.join(dir, `${name}.jsonl.gz`)));
    counts[name] = count;
  }
  const manifest: Manifest = { createdAt: new Date().toISOString(), database: db.databaseName, counts };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Restores a backup into `db`, which must be empty (a restore never merges into live data). */
export async function restore(db: Db, dir: string): Promise<Manifest> {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  for (const name of Object.keys(manifest.counts)) {
    if ((await db.collection(name).estimatedDocumentCount()) > 0) {
      throw new Error(`Refusing to restore: ${db.databaseName}.${name} is not empty.`);
    }
  }
  await ensureIndexes(db);
  for (const name of Object.keys(manifest.counts)) {
    const file = path.join(dir, `${name}.jsonl.gz`);
    const lines = createInterface({ input: fs.createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    let batch: Document[] = [];
    for await (const line of lines) {
      if (!line) continue;
      batch.push(EJSON.parse(line, { relaxed: false }) as Document);
      if (batch.length === 1000) {
        await db.collection(name).insertMany(batch, { ordered: true });
        batch = [];
      }
    }
    if (batch.length) await db.collection(name).insertMany(batch, { ordered: true });
  }
  return manifest;
}

/**
 * Each residence's money, computed straight from the collections (not through
 * the app's code, so a bug there cannot hide a bad restore): what its charges
 * total and what is paid of them, what came in, what went out.
 */
export async function ledgers(db: Db): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (org: unknown, key: string, value: number) => {
    const id = String(org);
    out[id] ??= { charges: 0, chargesPaid: 0, payments: 0, expenses: 0 };
    out[id][key] += value;
  };
  const sum = async (collection: string, match: Document, field: string) =>
    db
      .collection(collection)
      .aggregate<{ _id: unknown; total: number }>([
        { $match: match },
        { $group: { _id: "$organizationId", total: { $sum: `$${field}` } } },
      ])
      .toArray();
  for (const r of await sum(COLLECTIONS.assessments, {}, "amountMillimes")) add(r._id, "charges", r.total);
  for (const r of await sum(COLLECTIONS.assessments, {}, "paidMillimes")) add(r._id, "chargesPaid", r.total);
  for (const r of await sum(COLLECTIONS.payments, { status: "COMPLETED" }, "amountMillimes")) add(r._id, "payments", r.total);
  for (const r of await sum(COLLECTIONS.expenses, { status: "RECORDED" }, "amountMillimes")) add(r._id, "expenses", r.total);
  return out;
}

/** Documents per collection, now. */
export async function counts(db: Db, names: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(names.map(async (n) => [n, await db.collection(n).countDocuments()] as const));
  return Object.fromEntries(entries);
}
