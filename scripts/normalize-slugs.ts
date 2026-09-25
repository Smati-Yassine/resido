/**
 * One-off: gives every residence the clean slug of its name
 * ("residence-demo" instead of "residence-demo-3f2a1c"). Old slugs are kept,
 * so links made before still redirect. Safe to re-run.
 *
 * Usage: npm run normalize-slugs
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getDb, getMongoClient } from "@/lib/db/client";
import { ensureIndexes } from "@/lib/db/collections";
import { normalizeAllSlugs } from "@/lib/domain/residences/repository";

async function main() {
  await ensureIndexes(await getDb());
  const { changed } = await normalizeAllSlugs();
  console.log(`${changed} residence slug(s) updated`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await getMongoClient()).close();
  });
