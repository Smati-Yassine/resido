/**
 * Structured server logs (docs/13-observability.md): one JSON line per event,
 * which the host's log search (Vercel's, or any other) filters by field —
 * `event:"request_error"`, `event:"signin_failed"`… Keys that may hold a
 * secret or personal data are blanked before anything is written, even when
 * a caller forgets.
 */
const REDACTED = /pass(word)?|secret|token|uri|cookie|authorization|email|phone/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, REDACTED.test(key) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...(redact(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
