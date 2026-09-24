import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getDb, getMongoClient } from "@/lib/db/client";
import { ensureIndexes } from "@/lib/db/collections";

async function main() {
  const db = await getDb();
  await ensureIndexes(db);
  console.log("Indexes ensured.");
  const client = await getMongoClient();
  await client.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
