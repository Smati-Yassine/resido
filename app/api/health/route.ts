import { getDb } from "@/lib/db/client";

/**
 * Where the server runs and how far the database is from it: three pings,
 * in milliseconds. A few ms means the functions sit next to the database;
 * tens of ms per ping add up on every page (one page makes a dozen or more).
 */
export async function GET() {
  const db = await getDb();
  const pings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await db.command({ ping: 1 });
    pings.push(Math.round(performance.now() - start));
  }
  return Response.json(
    { region: process.env.VERCEL_REGION ?? "local", dbPingMs: pings },
    { headers: { "cache-control": "no-store" } },
  );
}
