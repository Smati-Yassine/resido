/**
 * Load test (docs/08-performance-scalability.md, docs/runbook.md): signs in
 * once, then USERS virtual users open the residence's pages back to back for
 * DURATION seconds, as a syndic clicking through would. Reports requests per
 * second, latency percentiles and errors per page.
 *
 *   BASE_URL=http://localhost:3000 USERS=50 DURATION=60 npm run load-test
 *
 * Other variables: EMAIL, PASSWORD (default: the seeded demo admin),
 * RESIDENCE (default: residence-demo). Anything but localhost needs
 * LOAD_TEST_CONFIRM=yes: never point this at production without warning
 * whoever runs it, and never at a database with real users at peak time.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const USERS = Number(process.env.USERS ?? 20);
const DURATION = Number(process.env.DURATION ?? 30) * 1000;
const EMAIL = process.env.EMAIL ?? "admin@resido.local";
const PASSWORD = process.env.PASSWORD ?? "ChangeMe123!";
const RESIDENCE = `/residences/${process.env.RESIDENCE ?? "residence-demo"}`;

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
if (!local && process.env.LOAD_TEST_CONFIRM !== "yes") {
  console.error(`${BASE} is not local. Set LOAD_TEST_CONFIRM=yes if you really mean to load it.`);
  process.exit(1);
}

/** The pages, with how often a syndic opens each. */
const PAGES = [
  ["residences", "/residences", 1],
  ["dashboard", RESIDENCE, 3],
  ["finances", `${RESIDENCE}/finances`, 2],
  ["payments", `${RESIDENCE}/finances/payments`, 3],
  ["expenses", `${RESIDENCE}/finances/expenses`, 1],
  ["lots", `${RESIDENCE}/property/lots`, 2],
  ["owners", `${RESIDENCE}/property/owners`, 1],
  ["settings", `${RESIDENCE}/settings`, 1],
];
const bag = PAGES.flatMap(([name, path, weight]) => Array(weight).fill([name, path]));

/** Cookies from a response, merged into a jar. */
function remember(jar, response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, ...value] = pair.split("=");
    jar.set(name.trim(), value.join("="));
  }
}
const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function signIn() {
  const jar = new Map();
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  remember(jar, csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/residences` }),
  });
  remember(jar, response);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) throw new Error("Sign-in failed: check EMAIL/PASSWORD.");
  return cookieHeader(jar);
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

async function main() {
  const cookie = await signIn();
  const stats = new Map(PAGES.map(([name]) => [name, { times: [], errors: 0 }]));
  const end = Date.now() + DURATION;
  console.log(`${USERS} users on ${BASE} for ${DURATION / 1000} s…`);

  const user = async () => {
    while (Date.now() < end) {
      const [name, path] = bag[Math.floor(Math.random() * bag.length)];
      const started = performance.now();
      try {
        const response = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
        await response.arrayBuffer();
        if (response.status !== 200) stats.get(name).errors += 1;
        else stats.get(name).times.push(performance.now() - started);
      } catch {
        stats.get(name).errors += 1;
      }
    }
  };
  const t0 = performance.now();
  await Promise.all(Array.from({ length: USERS }, user));
  const seconds = (performance.now() - t0) / 1000;

  const all = [...stats.values()].flatMap((s) => s.times).sort((a, b) => a - b);
  const errors = [...stats.values()].reduce((n, s) => n + s.errors, 0);
  const row = (name, times, errs) => {
    const sorted = [...times].sort((a, b) => a - b);
    const ms = (v) => `${Math.round(v)}`.padStart(6);
    return `${name.padEnd(11)} ${String(sorted.length).padStart(6)} ${ms(percentile(sorted, 50))} ${ms(percentile(sorted, 95))} ${ms(percentile(sorted, 99))} ${String(errs).padStart(6)}`;
  };
  console.log(`\n${"page".padEnd(11)} ${"ok".padStart(6)} ${"p50".padStart(6)} ${"p95".padStart(6)} ${"p99".padStart(6)} ${"errors".padStart(6)}  (ms)`);
  for (const [name, s] of stats) console.log(row(name, s.times, s.errors));
  console.log(row("all", all, errors));
  console.log(`\n${(all.length / seconds).toFixed(1)} pages/s, ${errors} errors (${((errors / (all.length + errors || 1)) * 100).toFixed(1)} %).`);
  if (errors) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
