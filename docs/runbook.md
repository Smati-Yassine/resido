# Runbook

What to do, in order, to put Résido in production, ship a release, and get
out of trouble. Hosting is Vercel (`vercel.json`), the database MongoDB Atlas.

## First deployment

1. **Atlas**
   - A dedicated cluster (M10 or above): replica set, which transactions need.
   - Backups on, with **continuous cloud backup (point-in-time recovery)**.
   - Network access: Vercel's egress, not `0.0.0.0/0` if the plan allows
     (otherwise a long random password and TLS only).
   - A database user limited to the Résido database (`readWrite`).
2. **Vercel environment variables** (Production, and Preview with a separate
   database — never production data in previews):
   - `MONGODB_URI`, `MONGODB_DB`
   - `AUTH_SECRET` — `openssl rand -hex 32`; changing it signs everyone out.
   - `AUTH_TRUST_HOST=true` if the host needs it.
3. **Indexes**: `npm run ensure-indexes` with production's `MONGODB_URI` /
   `MONGODB_DB` in `.env.local` (or the environment). Idempotent.
4. **Uptime monitoring**: an external check on `GET /api/health` every minute
   (Vercel's, Better Stack, UptimeRobot…). Healthy: `200` with `"ok": true`;
   database unreachable: `503`. Alert after 2–3 failures in a row.
5. **Log alerts** (Vercel → Logs, or a log drain): the app writes one JSON
   line per event (`lib/log.ts`). Worth an alert:
   - `"event":"request_error"` — any server error; the `digest` matches the
     code on the user's error page;
   - `"event":"signin_throttled"` — several per minute is someone guessing
     passwords; `signin_failed` spiking the same;
   - `"event":"health_db_unreachable"`.
6. **Smoke test** on the production URL: sign in, open a residence, record and
   delete a test payment in a test residence, print a PDF, download an Excel
   export, install on a phone (checklist in [Phones](#phones)).

## Every release

1. CI green on `main` (`.github/workflows/ci.yml`: lint, types, unit,
   integration, end-to-end on a production build).
2. If `lib/db/collections.ts` changed: `npm run ensure-indexes` against
   production **before** the deploy goes live.
3. After the deploy: `/api/health` shows the new `version`; open the app once.
   Open pages and installed apps pick the new version up by themselves (at
   their next navigation, or on returning to the foreground).

## Rollback

Vercel → Deployments → the last good one → **Instant Rollback**. Code only:
the database stays as it is, so a release that changed stored data needs its
own way back — say so in its pull request. Clients on the rolled-back
version reload onto the old one at their next navigation.

## Backups and the restore drill

- **Atlas point-in-time recovery** is the first line: restore to a new
  cluster at any minute within the retention window (Atlas UI → Backup →
  Restore). Never restore over the live cluster.
- **Our own copy** (`npm run backup`, with production's variables): a folder
  in `backups/` — one gzipped file per collection and a manifest. It holds
  personal data: keep it encrypted and private, never in the repository.
  Suggested: monthly, and before any risky release.
- **Restore drill**, every quarter and after any change to how money is
  stored — the proof the backups are worth something:

  ```sh
  RESTORE_MONGODB_URI=<scratch cluster or same cluster> RESTORE_MONGODB_DB=resido_drill npm run restore:drill
  ```

  It backs up, restores into the scratch database, compares every
  collection's count and every residence's money (charges, paid, payments,
  expenses — computed from the documents, not through the app), then drops
  the scratch database. "Restore drill passed" or the list of differences.
  Note the date and the result.
- **Putting a restore live**: restore into a new database
  (`RESTORE_MONGODB_URI=… RESTORE_MONGODB_DB=… npm run restore -- <folder>`, or
  Atlas), check it, then point `MONGODB_URI` / `MONGODB_DB` at it and redeploy.
  The script refuses a non-empty target and the app's own database.

## Load test

`npm run load-test` (`scripts/load-test.mjs`) signs in and has N users click
through a residence's pages. Refuses anything but localhost unless
`LOAD_TEST_CONFIRM=yes` — run it against a **preview** deployment on the same
Atlas tier as production, never production with users on it.

Baseline, 2026-09-27, one local production server, local database, seeded
demo residence (42 lots), users clicking without pause:

| users | pages/s | p50 | p95 | errors |
|---|---|---|---|---|
| 1 | 40 | 23 ms | 37 ms | 0 |
| 50 | 48 | 1.0 s | 1.2 s | 0 |
| 200 | 46 | 4.1 s | 6.2 s | 0 |

One server process does ~45 pages/s; beyond that, pages wait their turn —
nothing fails. 1,000 concurrent syndics, a page every 15–30 s each, is
35–70 pages/s: one or two instances, which Vercel adds by itself. The limit to
watch is the database: re-run against a preview on the production tier and
watch Atlas's connections and operation latency.

## Incidents

- **Site down, `/api/health` 503**: Atlas status and network access first;
  then the cluster's metrics (connections, CPU). The app recovers by itself
  once the database answers.
- **A user locked out of sign-in** ("Too many attempts"): it lifts after
  15 minutes. Sooner: delete their `loginFailures` documents
  (`{ key: /<their email>/ }`).
- **An account compromised**: the user changes their password (ends every
  session), or "Sign out everywhere" in Account settings. An admin removes
  them from residences if needed.
- **Wrong data entered**: every change is in the residence's journal
  (Settings → Journal); correct it in the app, which records the correction.
  Restoring a backup is for loss, not for mistakes.
- **A server error reported by a user**: find the `request_error` log line
  with the digest shown on their error page.

## Phones

After a release that touches the layout, on a real iPhone and a real Android
phone:

- Install to the home screen (iPhone: Share → Sur l'écran d'accueil; Android:
  the install card or the browser menu). It opens full screen, with the
  Résido icon.
- Nothing hidden under the notch or the home bar: top bar, tab bar, sheets'
  buttons.
- Print a document: the share menu opens; on iPhone, Imprimer is in it.
- Airplane mode: the "Pas de connexion" screen; back online, it lifts.
- Rotate the phone: the layout follows.
