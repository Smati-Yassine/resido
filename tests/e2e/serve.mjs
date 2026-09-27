/**
 * The app as the end-to-end tests see it (started by playwright.config.ts):
 * a fresh in-memory MongoDB replica set, seeded with the demo residence
 * (scripts/seed.ts), then Next.js on top — `next dev`, or the production
 * build with E2E_PROD=1 (run `next build` first). Never touches a real
 * database: these variables win over any .env file.
 */
import { spawn } from "node:child_process";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const port = process.env.E2E_PORT ?? "3310";
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const env = {
  ...process.env,
  MONGODB_URI: replSet.getUri(),
  MONGODB_DB: "resido_e2e",
  AUTH_SECRET: "e2e-only-secret-not-for-any-real-deployment",
  AUTH_TRUST_HOST: "true",
  AUTH_URL: `http://localhost:${port}`,
};

// Not spawnSync: the database's process logs through this one, which must keep running meanwhile.
const seeded = await new Promise((resolve) =>
  spawn("npx", ["tsx", "scripts/seed.ts"], { env, stdio: "inherit" }).on("exit", (code) => resolve(code === 0)),
);
if (!seeded) {
  await replSet.stop();
  process.exit(1);
}

const mode = process.env.E2E_PROD === "1" ? "start" : "dev";
const next = spawn("npx", ["next", mode, "-p", port], { env, stdio: "inherit" });

async function stop(code = 0) {
  next.kill("SIGTERM");
  await replSet.stop();
  process.exit(code);
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
next.on("exit", (code) => stop(code ?? 0));
