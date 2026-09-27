import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";

/**
 * Where the server runs and how far the database is from it: three pings,
 * in milliseconds. A few ms means the functions sit next to the database;
 * tens of ms per ping add up on every page (one page makes a dozen or more).
 * Also the uptime check: 200 with `ok: true`, or 503 when the database does
 * not answer (docs/runbook.md).
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };
  const version = process.env.RESIDO_BUILD || "local";
  try {
    const db = await getDb();
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await db.command({ ping: 1 });
      pings.push(Math.round(performance.now() - start));
    }
    return Response.json(
      { ok: true, version, region: process.env.VERCEL_REGION ?? "local", dbPingMs: pings },
      { headers },
    );
  } catch (error) {
    // For uptime monitoring: an unreachable database is a 503, not a crash.
    log("error", "health_db_unreachable", { message: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, version, error: "database unreachable" }, { status: 503, headers });
  }
}
