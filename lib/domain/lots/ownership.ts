import type { ClientSession } from "mongodb";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import { effectiveOwnerId } from "@/lib/domain/assessments/schema";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import type { Cycle } from "@/lib/domain/cycles/schema";
import * as repo from "./repository";
import type { Lot } from "./schema";

/**
 * Ownership is kept per cycle: each assessment records who owned the lot in
 * its cycle, and the lot's own `ownerId` is who will own it in cycles still
 * to open. So a sale recorded in 2027 leaves 2026 with its old owner.
 */

/** Cycles that bill lots (OPEN or CLOSED), oldest first. */
async function billedCycles(organizationId: string): Promise<Cycle[]> {
  return (await cyclesRepo.listCycles(organizationId)).filter((c) => c.status !== "DRAFT").reverse();
}

/** The cycle a change applies from when none is given: the open one, else none (the lots' own owners). */
export async function defaultCycleId(organizationId: string): Promise<string | null> {
  return (await cyclesRepo.findOpenCycle(organizationId))?.id ?? null;
}

/**
 * Who owns each lot in `cycleId`: the cycle's recorded owner for lots it
 * bills, the lot's own owner otherwise (no cycle, a draft, a lot added later).
 */
export async function lotOwnersInCycle(
  organizationId: string,
  lots: Lot[],
  cycleId: string | null,
): Promise<Map<string, string | null>> {
  const assessments = cycleId ? await assessmentsRepo.listAssessmentsForCycle(organizationId, cycleId) : [];
  const byLot = new Map(assessments.map((a) => [a.lotId, a]));
  return new Map(
    lots.map((lot) => {
      const assessment = byLot.get(lot.id);
      return [lot.id, assessment ? effectiveOwnerId(assessment, lot.ownerId) : lot.ownerId];
    }),
  );
}

/**
 * Hands `lot` to `ownerId` from `fromCycleId` onward. The change covers that
 * cycle and each later one that still had the same owner — it stops at the
 * first cycle where someone else already owned the lot, and earlier cycles
 * keep their owner. The lot's own owner (for cycles still to open) follows
 * when the change reaches the latest cycle. Without a billed cycle, only the
 * lot's own owner changes.
 */
export async function changeLotOwner(
  organizationId: string,
  lot: Lot,
  ownerId: string | null,
  fromCycleId: string | null,
  session: ClientSession,
): Promise<void> {
  const cycles = await billedCycles(organizationId);
  const from = fromCycleId ? cycles.findIndex((c) => c.id === fromCycleId) : -1;
  // Legacy assessments follow the lot's owner; pin them first so they keep it.
  await assessmentsRepo.pinLegacyOwner(organizationId, lot.id, lot.ownerId, session);

  if (from === -1) {
    if (lot.ownerId !== ownerId) await repo.setLotOwner(organizationId, lot.id, ownerId, session);
    return;
  }

  const assessments = await assessmentsRepo.listAssessmentsForLot(organizationId, lot.id);
  const byCycle = new Map(assessments.map((a) => [a.cycleId, a]));
  const ownerOf = (cycleId: string) => {
    const assessment = byCycle.get(cycleId);
    return assessment ? effectiveOwnerId(assessment, lot.ownerId) : undefined;
  };
  const previous = ownerOf(cycles[from].id) ?? lot.ownerId;
  if (previous === ownerId) return;

  const targets: string[] = [];
  let reachedLatest = true;
  for (const [i, cycle] of cycles.slice(from).entries()) {
    const assessment = byCycle.get(cycle.id);
    if (!assessment) continue;
    if (i > 0 && ownerOf(cycle.id) !== previous) {
      reachedLatest = false;
      break;
    }
    targets.push(assessment.id);
  }
  await assessmentsRepo.setAssessmentsOwner(organizationId, targets, ownerId, session);
  if (reachedLatest && lot.ownerId === previous) await repo.setLotOwner(organizationId, lot.id, ownerId, session);
}

/**
 * Takes an owner off every lot from `fromCycleId` onward — and off the lots'
 * own owners, for cycles still to open. Earlier cycles keep them. Without a
 * billed cycle, only the lots' own owners change.
 */
export async function removeOwnerFrom(
  organizationId: string,
  ownerId: string,
  fromCycleId: string | null,
  session: ClientSession,
): Promise<void> {
  const cycles = await billedCycles(organizationId);
  const from = fromCycleId ? cycles.findIndex((c) => c.id === fromCycleId) : -1;
  const held = (await repo.listLots(organizationId)).filter((lot) => lot.ownerId === ownerId);
  // Legacy assessments of their lots follow the lot's owner: pin them before it changes.
  for (const lot of held) await assessmentsRepo.pinLegacyOwner(organizationId, lot.id, ownerId, session);
  const fromOn = from === -1 ? [] : cycles.slice(from).map((c) => c.id);
  await assessmentsRepo.clearOwnerInCycles(organizationId, ownerId, fromOn, session);
  for (const lot of held) await repo.setLotOwner(organizationId, lot.id, null, session);
}
