/**
 * Local development seed: one demo account and one demo residence with the
 * data the design prototype shows — blocs and lots, a CLOSED 2025 cycle and
 * an OPEN 2026 cycle with its payments (some partial) and expenses. Uses no
 * real owner data (see scripts/seed-data.ts).
 *
 * Re-running is safe: an existing demo residence is left untouched.
 * Usage: npm run seed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { getDb, getMongoClient } from "@/lib/db/client";
import { ensureIndexes, COLLECTIONS } from "@/lib/db/collections";
import { toDecimalString, millimes } from "@/lib/money";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import * as users from "@/lib/domain/users/service";
import * as residences from "@/lib/domain/residences/service";
import * as buildings from "@/lib/domain/buildings/service";
import * as lots from "@/lib/domain/lots/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as payments from "@/lib/domain/payments/service";
import * as expenses from "@/lib/domain/expenses/service";
import * as overview from "@/lib/domain/overview/service";
import {
  BLOCS,
  LOTS,
  UNPAID_2025,
  PARTIAL_2025,
  PAYMENTS_2026,
  EXPENSES_2025,
  EXPENSES_2026,
  OPENING_BALANCE_2025,
} from "./seed-data";

const DEMO_EMAIL = "admin@resido.local";
const DEMO_PASSWORD = "ChangeMe123!";
const DEMO_RESIDENCE = "Résidence Démo";

function unwrap<T>(result: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

const dt = (value: number) => toDecimalString(millimes(value));

async function findOrCreateUser(): Promise<string> {
  const db = await getDb();
  const existing = await db.collection(COLLECTIONS.users).findOne({ email: DEMO_EMAIL });
  if (existing) return existing._id.toHexString();
  const user = unwrap(await users.registerUser({ name: "Admin syndic", email: DEMO_EMAIL, password: DEMO_PASSWORD }));
  console.log(`Created user ${DEMO_EMAIL}`);
  return user.id;
}

async function recordExpenses(session: AuthorizedSession, residenceId: string, list: typeof EXPENSES_2025) {
  for (const [date, label, reference, amount] of list) {
    unwrap(
      await expenses.recordExpense(session, residenceId, {
        label,
        reference: reference || undefined,
        amountMillimes: dt(amount),
        date,
        idempotencyKey: randomUUID(),
      }),
    );
  }
}

async function seedResidence(userId: string) {
  const residence = unwrap(await residences.createResidence(userId, { name: DEMO_RESIDENCE, city: "Tunis" }));
  const session: AuthorizedSession = { userId, organizationId: residence.id, role: "SYNDIC_ADMIN", status: "ACTIVE" };
  const id = residence.id;

  const blocIds = new Map<string, string>();
  for (const name of BLOCS) {
    blocIds.set(name, unwrap(await buildings.createBuilding(session, id, { name })).id);
  }
  for (const [code, bloc, charge] of LOTS) {
    unwrap(await lots.createLot(session, id, { buildingId: blocIds.get(bloc)!, code, chargeMillimes: dt(charge) }));
  }

  // 2025: everyone paid in one go at the start of the year, except a few.
  const c2025 = unwrap(
    await cycles.createCycle(session, id, { name: "Cycle 2025", startDate: "2025-01-01", endDate: "2025-12-31" }),
  );
  unwrap(await cycles.openCycle(session, id, { cycleId: c2025.id }));
  unwrap(
    await cycles.setOpeningBalance(session, id, { cycleId: c2025.id, openingTreasuryBalanceMillimes: dt(OPENING_BALANCE_2025) }),
  );
  const rows2025 = await overview.getLotRows(session, id, c2025.id);
  for (const row of rows2025) {
    if (UNPAID_2025.includes(row.code)) continue;
    const amount = row.code === PARTIAL_2025[0] ? PARTIAL_2025[1] : row.dueMillimes;
    unwrap(
      await payments.recordPayment(session, id, {
        date: "2025-01-15",
        method: "CASH",
        idempotencyKey: randomUUID(),
        allocations: [{ assessmentId: row.assessmentId, amountMillimes: dt(amount) }],
      }),
    );
  }
  await recordExpenses(session, id, EXPENSES_2025);
  unwrap(await cycles.closeCycle(session, id, { cycleId: c2025.id }));

  // 2026: open-ended, its opening balance carried over from 2025's close.
  const c2026 = unwrap(await cycles.createCycle(session, id, { name: "Cycle 2026", startDate: "2026-01-01" }));
  unwrap(await cycles.openCycle(session, id, { cycleId: c2026.id }));
  const rows2026 = await overview.getLotRows(session, id, c2026.id);
  const byCode = new Map(rows2026.map((r) => [r.code, r]));
  for (const [date, codes, method, note] of PAYMENTS_2026) {
    unwrap(
      await payments.recordPayment(session, id, {
        date,
        method,
        note: note || undefined,
        idempotencyKey: randomUUID(),
        allocations: codes.map((code) => {
          const row = byCode.get(code)!;
          return { assessmentId: row.assessmentId, amountMillimes: dt(row.dueMillimes) };
        }),
      }),
    );
  }
  await recordExpenses(session, id, EXPENSES_2026);

  console.log(`Created "${DEMO_RESIDENCE}": ${LOTS.length} lots, cycles 2025 (closed) and 2026 (open)`);
}

async function main() {
  const db = await getDb();
  await ensureIndexes(db);

  const userId = await findOrCreateUser();
  const cards = await residences.listResidenceCards(userId);
  if (cards.some((c) => c.name === DEMO_RESIDENCE)) {
    console.log(`"${DEMO_RESIDENCE}" already exists — nothing to do.`);
  } else {
    await seedResidence(userId);
  }
  console.log(`\nSign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await getMongoClient()).close();
  });
