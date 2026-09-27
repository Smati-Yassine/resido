/**
 * Backs the database up to backups/<date> (or the folder given): one gzipped
 * file per collection and a manifest. Holds personal data — backups/ is never
 * committed; keep copies somewhere private (docs/runbook.md).
 * Usage: npm run backup [-- <folder>]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import path from "node:path";
import { getDb, getMongoClient } from "@/lib/db/client";
import { backup } from "./lib/backup";

async function main() {
  const dir = process.argv[2] ?? path.join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
  const manifest = await backup(await getDb(), dir);
  console.log(`Backed up ${manifest.database} to ${dir}:`);
  for (const [name, count] of Object.entries(manifest.counts)) console.log(`  ${name}: ${count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => (await getMongoClient()).close());
