/**
 * The restore drill (docs/runbook.md): backs up the app's database, restores
 * the copy into a scratch database, and checks nothing was lost — every
 * collection's count, and every residence's money (charges, paid, payments,
 * expenses) computed straight from the documents on both sides. Leaves the
 * scratch database dropped and the backup in backups/drill-<date>.
 * Usage: RESTORE_MONGODB_URI=… RESTORE_MONGODB_DB=resido_drill npm run restore:drill
 * (the scratch database may be on the same cluster; it must be empty.)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import path from "node:path";
import { MongoClient } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/client";
import { backup, counts, ledgers, restore } from "./lib/backup";

async function main() {
  const uri = process.env.RESTORE_MONGODB_URI;
  const dbName = process.env.RESTORE_MONGODB_DB;
  if (!uri || !dbName) throw new Error("Set RESTORE_MONGODB_URI and RESTORE_MONGODB_DB to a scratch database.");
  if (uri === process.env.MONGODB_URI && dbName === process.env.MONGODB_DB) {
    throw new Error("The scratch database cannot be the app's own.");
  }
  const source = await getDb();
  const dir = path.join("backups", `drill-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const started = Date.now();

  const manifest = await backup(source, dir);
  const client = await MongoClient.connect(uri);
  const scratch = client.db(dbName);
  const problems: string[] = [];
  try {
    await restore(scratch, dir);
    const names = Object.keys(manifest.counts);
    const restored = await counts(scratch, names);
    for (const name of names) {
      if (restored[name] !== manifest.counts[name])
        problems.push(`${name}: ${manifest.counts[name]} backed up, ${restored[name]} restored`);
    }
    const [before, after] = await Promise.all([ledgers(source), ledgers(scratch)]);
    for (const [residence, figures] of Object.entries(before)) {
      for (const [key, value] of Object.entries(figures)) {
        if (after[residence]?.[key] !== value)
          problems.push(`residence ${residence} ${key}: ${value} before, ${after[residence]?.[key]} after`);
      }
    }
    console.log(`Drill: ${Object.values(manifest.counts).reduce((a, b) => a + b, 0)} documents, `
      + `${Object.keys(before).length} residences, ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } finally {
    await scratch.dropDatabase();
    await client.close();
    await (await getMongoClient()).close();
  }
  if (problems.length) {
    console.error("RESTORE DRILL FAILED:\n  " + problems.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("Restore drill passed: every collection and every residence's money match.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
