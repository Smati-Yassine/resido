import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { resetEnvForTests } from "@/lib/env";
import { resetMongoClientForTests } from "@/lib/db/client";

let replSet: MongoMemoryReplSet | undefined;
let client: MongoClient | undefined;

/**
 * Integration tests run against a real, replica-set-enabled in-memory
 * MongoDB instance so transactions/indexes/uniqueness are exercised for
 * real — see docs/11-testing-strategy.md #integration-tests.
 */
export async function startTestDb(): Promise<{ uri: string; dbName: string }> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  const dbName = "resido_test";

  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  process.env.AUTH_SECRET = "test-secret";
  // NODE_ENV is already "test" under Vitest; @types/node marks it read-only.
  resetEnvForTests();
  await resetMongoClientForTests();

  client = new MongoClient(uri);
  await client.connect();

  return { uri, dbName };
}

export async function stopTestDb(): Promise<void> {
  await client?.close();
  await resetMongoClientForTests();
  await replSet?.stop();
}

export async function clearTestDb(): Promise<void> {
  if (!client) return;
  const db = client.db("resido_test");
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
