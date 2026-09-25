import { loadWorkspace, lotRowsFor, activeLotsFor } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import * as owners from "@/lib/domain/owners/service";
import * as buildings from "@/lib/domain/buildings/service";
import { lotOwnersInCycle } from "@/lib/domain/lots/ownership";
import { PageHeader } from "@/components/ui/Display";
import { ClosedBanner } from "@/components/workspace/CycleState";
import { NewOwnerButton, type LotChoice } from "@/components/workspace/OwnerModals";
import { OwnersBoard, type OwnerItem, type OwnerLot } from "@/components/owners/OwnersBoard";

/** The owners for the cycle on screen — who owns which lots then, and what they still owe in it. */
export default async function OwnersPage({ params, searchParams }: PageProps<"/residences/[residenceId]/owners">) {
  const { session, residenceId, cycle, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();

  const [ownerResult, lotResult, blocResult, billed] = await Promise.all([
    owners.listOwners(session, residenceId),
    activeLotsFor(session, residenceId),
    buildings.listBuildings(session, residenceId),
    // What each lot is billed and has paid in the cycle on screen (nothing in a draft).
    cycle && cycle.status !== "DRAFT" ? lotRowsFor(session, residenceId, cycle.id) : Promise.resolve(null),
  ]);
  const allOwners = ownerResult.ok ? ownerResult.data : [];
  const lotList = lotResult.ok ? lotResult.data : [];
  const blocs = blocResult.ok ? blocResult.data : [];
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));
  const blocIndex = new Map(blocs.map((b, i) => [b.id, i]));
  const ownerName = new Map(allOwners.map((o) => [o.id, o.name]));
  const rowByLot = new Map((billed ?? []).map((r) => [r.lotId, r]));
  // Who owns each lot in the cycle on screen — owners change from one cycle to the next.
  const ownerOf = await lotOwnersInCycle(residenceId, lotList, cycle?.id ?? null);
  // A removed owner still shows in the cycles where they own lots (history), nowhere else.
  const holders = new Set([...ownerOf.values()].flat());
  // A lot's known owners in that cycle (a removed owner no longer listed counts as none).
  const ownersOf = (lotId: string) =>
    (ownerOf.get(lotId) ?? []).flatMap((id) => (ownerName.has(id) ? [{ id, name: ownerName.get(id)! }] : []));
  const shownOwners = allOwners.filter((o) => !o.removed || holders.has(o.id));

  const sortedLots = [...lotList].sort(
    (a, b) =>
      (blocIndex.get(a.buildingId ?? "") ?? -1) - (blocIndex.get(b.buildingId ?? "") ?? -1) ||
      a.code.localeCompare(b.code, "fr", { numeric: true }),
  );
  const toOwnerLot = (lot: (typeof lotList)[number], ownerId?: string): OwnerLot => ({
    id: lot.id,
    code: lot.code,
    bloc: lot.buildingId ? (blocName.get(lot.buildingId) ?? "") : "",
    status: rowByLot.get(lot.id)?.status ?? "NONE",
    coOwners: ownersOf(lot.id)
      .filter((o) => o.id !== ownerId)
      .map((o) => o.name),
  });

  const items: OwnerItem[] = shownOwners.map((owner) => {
    const held = sortedLots.filter((l) => ownerOf.get(l.id)?.includes(owner.id));
    return {
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      lots: held.map((l) => toOwnerLot(l, owner.id)),
      chargedMillimes: held.reduce(
        (n, l) => n + (rowByLot.get(l.id)?.dueMillimes ?? (billed ? 0 : l.chargeMillimes)),
        0,
      ),
      paidMillimes: held.reduce((n, l) => n + (rowByLot.get(l.id)?.paidMillimes ?? 0), 0),
    };
  });
  // Who owes the most first while a cycle is billed; by name otherwise.
  if (billed) items.sort((a, b) => b.chargedMillimes - b.paidMillimes - (a.chargedMillimes - a.paidMillimes));

  const unassigned = sortedLots.filter((l) => ownersOf(l.id).length === 0).map((l) => toOwnerLot(l));
  const choices: LotChoice[] = sortedLots.map((l) => ({
    id: l.id,
    code: l.code,
    bloc: l.buildingId ? (blocName.get(l.buildingId) ?? "") : "",
    owners: ownersOf(l.id),
  }));
  // Still due on owned lots, each lot once — a co-owned lot is not counted per co-owner.
  const totalDueMillimes = sortedLots
    .filter((l) => ownersOf(l.id).length > 0)
    .reduce((n, l) => n + ((rowByLot.get(l.id)?.dueMillimes ?? 0) - (rowByLot.get(l.id)?.paidMillimes ?? 0)), 0);

  return (
    <>
      {cycle && <ClosedBanner cycle={cycle} t={t} />}
      <PageHeader
        subtitle={interpolate(t.ownersSubtitle, {
          count: items.length,
          lots: lotList.length - unassigned.length,
          total: lotList.length,
        })}
        title={t.owners}
        actions={can("owners:*") && <NewOwnerButton residenceId={residenceId} lots={choices} />}
      />
      <OwnersBoard
        owners={items}
        unassigned={unassigned}
        lotCount={lotList.length}
        totalDueMillimes={totalDueMillimes}
        billed={!!billed}
        residenceId={residenceId}
        canManage={can("owners:*")}
        choices={choices}
      />
    </>
  );
}
