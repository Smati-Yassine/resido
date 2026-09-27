/**
 * The version the server runs now (its deploy id, see next.config.ts). An open
 * page compares it with its own to know a newer version has shipped.
 */
export function GET() {
  return Response.json({ id: process.env.RESIDO_BUILD ?? "" }, { headers: { "Cache-Control": "no-store" } });
}
