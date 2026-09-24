import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

// Single MongoClient instance per process, reused across requests (never
// `new MongoClient()` per request — see docs/08-performance-scalability.md).
// In development, Next.js hot-reloads modules; caching on `global` avoids
// recreating the connection pool on every reload.

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  const client = new MongoClient(env().MONGODB_URI, {
    maxPoolSize: 20,
    // Without this, the driver serializes `undefined` fields as BSON null
    // instead of omitting them — silently breaking every `field?: T`
    // optional-field convention used across lib/domain/**/schema.ts (a
    // stored `null` is not the same as an absent key, and code written
    // against "optional means possibly undefined" would see null instead).
    ignoreUndefined: true,
  });
  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  // In dev, Next.js's module hot-reload would otherwise recreate the pool
  // on every edit — cache on `global`, which survives module reloads within
  // the same process. In production the module is loaded once per process
  // anyway, so a plain module-level variable would suffice, but reusing the
  // same `global` cache keeps the code path identical in both environments.
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = createClient();
  }
  return global.__mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env().MONGODB_DB);
}

/**
 * Test-only: clears the cached client/pool so a fresh connection is made on
 * next use — needed between integration test suites that each spin up their
 * own mongodb-memory-server instance with a different connection URI.
 */
export async function resetMongoClientForTests(): Promise<void> {
  if (global.__mongoClientPromise) {
    const client = await global.__mongoClientPromise;
    await client.close();
  }
  global.__mongoClientPromise = undefined;
}
