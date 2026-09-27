/**
 * Restores a backup (scripts/backup.ts) into another, empty database, named
 * by RESTORE_MONGODB_URI and RESTORE_MONGODB_DB — never the one the app uses:
 * it refuses a target that is not empty, or that is the app's own database.
 * To put a restore live, point the app at the restored database (runbook).
 * Usage: RESTORE_MONGODB_URI=… RESTORE_MONGODB_DB=… npm run restore -- <folder>
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { MongoClient } from "mongodb";
import { restore } from "./lib/backup";

async function main() {
  const dir = process.argv[2];
  const uri = process.env.RESTORE_MONGODB_URI;
  const dbName = process.env.RESTORE_MONGODB_DB;
  if (!dir || !uri || !dbName) throw new Error("Usage: RESTORE_MONGODB_URI=… RESTORE_MONGODB_DB=… npm run restore -- <folder>");
  if (uri === process.env.MONGODB_URI && dbName === process.env.MONGODB_DB) {
    throw new Error("Refusing to restore into the app's own database: restore elsewhere, then switch.");
  }
  const client = await MongoClient.connect(uri);
  try {
    const manifest = await restore(client.db(dbName), dir);
    console.log(`Restored the backup of ${manifest.createdAt} into ${dbName}.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
