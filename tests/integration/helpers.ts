import { afterAll, afterEach, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { startTestDb, stopTestDb, clearTestDb } from "./setup";
import { getDb } from "@/lib/db/client";
import { ensureIndexes } from "@/lib/db/collections";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import * as residences from "@/lib/domain/residences/service";
import * as buildings from "@/lib/domain/buildings/service";
import * as lots from "@/lib/domain/lots/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as overview from "@/lib/domain/overview/service";

/** Starts one replica-set memory DB per test file and empties it between tests. */
export function setupTestDb(): void {
  beforeAll(async () => {
    await startTestDb();
    await ensureIndexes(await getDb());
  }, 60000);
  afterEach(async () => {
    await clearTestDb();
  });
  afterAll(async () => {
    await stopTestDb();
  });
}

export function unwrap<T>(result: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

export function newUserId(): string {
  return new ObjectId().toHexString();
}

export function adminSession(residenceId: string, userId = newUserId()): AuthorizedSession {
  return { userId, organizationId: residenceId, role: "SYNDIC_ADMIN", status: "ACTIVE" };
}

export const key = () => randomUUID();

/**
 * A residence with two blocs and three lots (charges 1000.000, 1500.000 and
 * 2000.000 DT), plus an OPEN cycle — the common starting point.
 */
export async function residenceWithOpenCycle() {
  const userId = newUserId();
  const residence = unwrap(await residences.createResidence(userId, { name: "Résidence Test", city: "Tunis" }));
  const session = adminSession(residence.id, userId);
  const blocA = unwrap(await buildings.createBuilding(session, residence.id, { name: "Bloc A" }));
  const blocB = unwrap(await buildings.createBuilding(session, residence.id, { name: "Bloc B" }));
  const a11 = unwrap(
    await lots.createLot(session, residence.id, { buildingId: blocA.id, code: "A11", chargeMillimes: "1000" }),
  );
  const a12 = unwrap(
    await lots.createLot(session, residence.id, { buildingId: blocA.id, code: "A12", chargeMillimes: "1500" }),
  );
  const b11 = unwrap(
    await lots.createLot(session, residence.id, { buildingId: blocB.id, code: "B11", chargeMillimes: "2000" }),
  );
  const draft = unwrap(await cycles.createCycle(session, residence.id, { name: "2026", startDate: "2026-01-01" }));
  const cycle = unwrap(await cycles.openCycle(session, residence.id, { cycleId: draft.id }));
  const rows = await overview.getLotRows(session, residence.id, cycle.id);
  const assessmentOf = (code: string) => rows.find((r) => r.code === code)!.assessmentId;
  return { userId, residence, session, blocA, blocB, lots: { a11, a12, b11 }, cycle, assessmentOf };
}
