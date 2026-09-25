import type { ClientSession } from "mongodb";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import { effectiveOwnerIds } from "@/lib/domain/assessments/schema";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import type { Cycle } from "@/lib/domain/cycles/schema";
import * as repo from "./repository";
import type { Lot } from "./schema";

/**
 * Ownership is kept per cycle: each assessment records who owned the lot in
 * its cycle — one owner, several (co-ownership), or none — and the lot's own
 * `ownerIds` is who will own it in cycles still to open. So a sale recorded in
 * 2027 leaves 2026 with its old owners.
 */

/** Two owner lists name the same people (order does not matter). */
export function sameOwners(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Cycles that bill lots (OPEN or CLOSED), oldest first. */
async function billedCycles(organizationId: string): Promise<Cycle[]> {
  return (await cyclesRepo.listCycles(organizationId)).filter((c) => c.status !== "DRAFT").reverse();
}

/** The cycle a change applies from when none is given: the open one, else none (the lots' own owners). */
export async function defaultCycleId(organizationId: string): Promise<string | null> {
  return (await cyclesRepo.findOpenCycle(organizationId))?.id ?? null;
}

/**
 * Who owns each lot in `cycleId`: the cycle's recorded owners for lots it
 * bills, the lot's own owners otherwise (no cycle, a draft, a lot added later).
 */
export async function lotOwnersInCycle(
  organizationId: string,
  lots: Lot[],
  cycleId: string | null,
): Promise<Map<string, string[]>> {
  const assessments = cycleId ? await assessmentsRepo.listAssessmentsForCycle(organizationId, cycleId) : [];
  const byLot = new Map(assessments.map((a) => [a.lotId, a]));
  return new Map(
    lots.map((lot) => {
      const assessment = byLot.get(lot.id);
      return [lot.id, assessment ? effectiveOwnerIds(assessment, lot.ownerIds) : lot.ownerIds];
    }),
  );
}

/**
 * Makes `ownerIds` the owners of `lot` from `fromCycleId` onward. The change
 * covers that cycle and each later one that still had the same owners — it
 * stops at the first cycle where the lot was owned otherwise, and earlier
 * cycles keep theirs. The lot's own owners (for cycles still to open) follow
 * when the change reaches the latest cycle. Without a billed cycle, only the
 * lot's own owners change.
 */
export async function changeLotOwners(
  organizationId: string,
  lot: Lot,
  ownerIds: string[],
  fromCycleId: string | null,
  session: ClientSession,
): Promise<void> {
  const cycles = await billedCycles(organizationId);
  const from = fromCycleId ? cycles.findIndex((c) => c.id === fromCycleId) : -1;
  // Older assessments follow the lot's owners; pin them first so they keep them.
  await assessmentsRepo.pinLegacyOwners(organizationId, lot.id, lot.ownerIds, session);

  if (from === -1) {
    if (!sameOwners(lot.ownerIds, ownerIds)) await repo.setLotOwners(organizationId, lot.id, ownerIds, session);
    return;
  }

  const assessments = await assessmentsRepo.listAssessmentsForLot(organizationId, lot.id);
  const byCycle = new Map(assessments.map((a) => [a.cycleId, a]));
  const ownersIn = (cycleId: string) => {
    const assessment = byCycle.get(cycleId);
    return assessment ? effectiveOwnerIds(assessment, lot.ownerIds) : undefined;
  };
  const previous = ownersIn(cycles[from].id) ?? lot.ownerIds;
  if (sameOwners(previous, ownerIds)) return;

  const targets: string[] = [];
  let reachedLatest = true;
  for (const [i, cycle] of cycles.slice(from).entries()) {
    const assessment = byCycle.get(cycle.id);
    if (!assessment) continue;
    if (i > 0 && !sameOwners(ownersIn(cycle.id) ?? [], previous)) {
      reachedLatest = false;
      break;
    }
    targets.push(assessment.id);
  }
  await assessmentsRepo.setAssessmentsOwners(organizationId, targets, ownerIds, session);
  if (reachedLatest && sameOwners(lot.ownerIds, previous)) {
    await repo.setLotOwners(organizationId, lot.id, ownerIds, session);
  }
}

/**
 * Takes an owner off every lot from `fromCycleId` onward — and off the lots'
 * own owners, for cycles still to open; co-owners keep their share. Earlier
 * cycles keep them. Without a billed cycle, only the lots' own owners change.
 */
export async function removeOwnerFrom(
  organizationId: string,
  ownerId: string,
  fromCycleId: string | null,
  session: ClientSession,
): Promise<void> {
  const cycles = await billedCycles(organizationId);
  const from = fromCycleId ? cycles.findIndex((c) => c.id === fromCycleId) : -1;
  const lots = await repo.listLots(organizationId);
  // Older assessments follow the lot's owners, or name a single owner: write them as lists first.
  for (const lot of lots) await assessmentsRepo.pinLegacyOwners(organizationId, lot.id, lot.ownerIds, session);
  const fromOn = from === -1 ? [] : cycles.slice(from).map((c) => c.id);
  await assessmentsRepo.clearOwnerInCycles(organizationId, ownerId, fromOn, session);
  for (const lot of lots.filter((l) => l.ownerIds.includes(ownerId))) {
    await repo.setLotOwners(
      organizationId,
      lot.id,
      lot.ownerIds.filter((id) => id !== ownerId),
      session,
    );
  }
}
