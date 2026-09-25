import type { Cycle } from "@/lib/domain/cycles/schema";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import * as buildings from "@/lib/domain/buildings/service";
import * as owners from "@/lib/domain/owners/service";
import { lotOwnersInCycle } from "@/lib/domain/lots/ownership";
import type { LotPaymentStatus } from "@/lib/domain/overview/service";
import { activeLotsFor, lotRowsFor } from "@/lib/workspace";
import type { LotItem } from "@/components/lots/LotsBoard";
import type { OwnerItem, OwnerLot } from "@/components/owners/OwnersBoard";
import type { LotChoice } from "@/components/workspace/OwnerModals";

type Option = { id: string; name: string };

/** A bloc at a glance: its lots, owners and charges, and — in a billed cycle — how much is collected. */
export interface BlocSummary {
  id: string;
  name: string;
  lotCount: number;
  ownerCount: number;
  chargeMillimes: number;
  paidMillimes: number;
  status: Record<LotPaymentStatus, number>;
}

/**
 * Everything the Copropriété page shows, for the cycle on screen: lots with
 * their owners then (co-owned ones with all of them), owners with their lots,
 * blocs, and the figures of the strip. One load serves all three tabs.
 */
export async function loadProperty(session: AuthorizedSession, residenceId: string, cycle: Cycle | null) {
  const [blocResult, lotResult, ownerResult, billed] = await Promise.all([
    buildings.listBuildings(session, residenceId),
    activeLotsFor(session, residenceId),
    owners.listOwners(session, residenceId),
    cycle && cycle.status !== "DRAFT" ? lotRowsFor(session, residenceId, cycle.id) : Promise.resolve(null),
  ]);
  const blocs: Option[] = (blocResult.ok ? blocResult.data : []).map((b) => ({ id: b.id, name: b.name }));
  const lotList = lotResult.ok ? lotResult.data : [];
  const allOwners = ownerResult.ok ? ownerResult.data : [];
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));
  const blocIndex = new Map(blocs.map((b, i) => [b.id, i]));
  const ownerName = new Map(allOwners.map((o) => [o.id, o.name]));
  const rowByLot = new Map((billed ?? []).map((r) => [r.lotId, r]));

  // Who owns each lot in the cycle on screen — owners change from one cycle to the next.
  const ownerOf = await lotOwnersInCycle(residenceId, lotList, cycle?.id ?? null);
  // A lot's known owners in that cycle (a removed owner no longer listed counts as none).
  const ownersOf = (lotId: string) =>
    (ownerOf.get(lotId) ?? []).flatMap((id) => (ownerName.has(id) ? [{ id, name: ownerName.get(id)! }] : []));
  // A removed owner still shows in the cycles where they own lots (history), nowhere else.
  const holders = new Set([...ownerOf.values()].flat());
  const shownOwners = allOwners.filter((o) => !o.removed || holders.has(o.id));

  // Bloc order, then codes in natural order (A2 before A10). In a billed cycle, the lots it bills.
  const sortedLots = (billed ? lotList.filter((l) => rowByLot.has(l.id)) : lotList).sort(
    (a, b) =>
      (blocIndex.get(a.buildingId ?? "") ?? -1) - (blocIndex.get(b.buildingId ?? "") ?? -1) ||
      a.code.localeCompare(b.code, "fr", { numeric: true }),
  );
  const chargeOf = (lotId: string, fallback: number) => rowByLot.get(lotId)?.dueMillimes ?? fallback;
  const paidOf = (lotId: string) => rowByLot.get(lotId)?.paidMillimes ?? 0;

  const lotItems: LotItem[] = sortedLots.map((lot) => {
    const owned = ownersOf(lot.id);
    const row = rowByLot.get(lot.id);
    return {
      id: lot.id,
      code: lot.code,
      blocId: lot.buildingId,
      blocName: lot.buildingId ? (blocName.get(lot.buildingId) ?? "") : "",
      ownerName: owned.length ? owned.map((o) => o.name).join(" & ") : null,
      chargeMillimes: chargeOf(lot.id, lot.chargeMillimes),
      paidMillimes: row ? row.paidMillimes : null,
      status: row?.status ?? null,
      edit: {
        id: lot.id,
        code: lot.code,
        buildingId: lot.buildingId,
        chargeMillimes: chargeOf(lot.id, lot.chargeMillimes),
        ownerIds: owned.map((o) => o.id),
      },
    };
  });

  const toOwnerLot = (lot: (typeof lotList)[number], ownerId?: string): OwnerLot => ({
    id: lot.id,
    code: lot.code,
    bloc: lot.buildingId ? (blocName.get(lot.buildingId) ?? "") : "",
    status: rowByLot.get(lot.id)?.status ?? "NONE",
    coOwners: ownersOf(lot.id)
      .filter((o) => o.id !== ownerId)
      .map((o) => o.name),
  });
  const ownerItems: OwnerItem[] = shownOwners.map((owner) => {
    const held = sortedLots.filter((l) => ownerOf.get(l.id)?.includes(owner.id));
    return {
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      lots: held.map((l) => toOwnerLot(l, owner.id)),
      chargedMillimes: held.reduce((n, l) => n + chargeOf(l.id, billed ? 0 : l.chargeMillimes), 0),
      paidMillimes: held.reduce((n, l) => n + paidOf(l.id), 0),
    };
  });
  // Who owes the most first while a cycle is billed; by name otherwise.
  if (billed) ownerItems.sort((a, b) => b.chargedMillimes - b.paidMillimes - (a.chargedMillimes - a.paidMillimes));

  const unassigned = sortedLots.filter((l) => ownersOf(l.id).length === 0).map((l) => toOwnerLot(l));
  const choices: LotChoice[] = sortedLots.map((l) => ({
    id: l.id,
    code: l.code,
    bloc: l.buildingId ? (blocName.get(l.buildingId) ?? "") : "",
    owners: ownersOf(l.id),
  }));
  // Owners offered in the lot form: current ones, and removed ones still holding lots in this cycle.
  const ownerOptions: Option[] = shownOwners.map((o) => ({ id: o.id, name: o.name }));

  const blocSummaries: BlocSummary[] = blocs.map((b) => {
    const inBloc = lotItems.filter((l) => l.blocId === b.id);
    const status = { PAID: 0, PARTIAL: 0, UNPAID: 0 } as Record<LotPaymentStatus, number>;
    for (const l of inBloc) if (l.status) status[l.status] += 1;
    return {
      id: b.id,
      name: b.name,
      lotCount: inBloc.length,
      ownerCount: new Set(inBloc.flatMap((l) => l.edit.ownerIds)).size,
      chargeMillimes: inBloc.reduce((n, l) => n + l.chargeMillimes, 0),
      paidMillimes: inBloc.reduce((n, l) => n + (l.paidMillimes ?? 0), 0),
      status,
    };
  });

  const expected = lotItems.reduce((n, l) => n + l.chargeMillimes, 0);
  const collected = lotItems.reduce((n, l) => n + (l.paidMillimes ?? 0), 0);
  // Still due on owned lots, each lot once — a co-owned lot is not counted per co-owner.
  const ownedDueMillimes = lotItems
    .filter((l) => l.edit.ownerIds.length > 0)
    .reduce((n, l) => n + l.chargeMillimes - (l.paidMillimes ?? 0), 0);

  return {
    billed: !!billed,
    blocs,
    blocSummaries,
    lotItems,
    ownerItems,
    unassigned,
    choices,
    ownerOptions,
    ownedDueMillimes,
    figures: {
      lots: lotItems.length,
      blocs: blocs.length,
      owners: ownerItems.length,
      assigned: lotItems.length - unassigned.length,
      coOwned: lotItems.filter((l) => l.edit.ownerIds.length > 1).length,
      expectedMillimes: expected,
      collectedMillimes: collected,
      owing: lotItems.filter((l) => l.status === "PARTIAL" || l.status === "UNPAID").length,
    },
  };
}

export type PropertyData = Awaited<ReturnType<typeof loadProperty>>;
