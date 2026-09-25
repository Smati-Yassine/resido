import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import * as owners from "@/lib/domain/owners/service";
import * as lots from "@/lib/domain/lots/service";
import * as buildings from "@/lib/domain/buildings/service";
import { getLotRows } from "@/lib/domain/overview/service";
import { lotOwnersInCycle } from "@/lib/domain/lots/ownership";
import { PageHeader } from "@/components/ui/Display";
import { ClosedBanner } from "@/components/workspace/CycleState";
import { NewOwnerButton, type LotChoice } from "@/components/workspace/OwnerModals";
import { OwnersBoard, type OwnerItem, type OwnerLot } from "@/components/owners/OwnersBoard";

/** The owners for the cycle on screen — who owns which lots then, and what they still owe in it. */
export default async function OwnersPage({ params, searchParams }: PageProps<"/residences/[residenceId]/owners">) {
  const { session, residenceId, cycle, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();

  const [ownerResult, lotResult, blocResult] = await Promise.all([
    owners.listOwners(session, residenceId),
    lots.listLots(session, residenceId, { status: "ACTIVE" }),
    buildings.listBuildings(session, residenceId),
  ]);
  const allOwners = ownerResult.ok ? ownerResult.data : [];
  const lotList = lotResult.ok ? lotResult.data : [];
  const blocs = blocResult.ok ? blocResult.data : [];
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));
  const blocIndex = new Map(blocs.map((b, i) => [b.id, i]));
  const ownerName = new Map(allOwners.map((o) => [o.id, o.name]));
  // What each lot is billed and has paid in the cycle on screen (nothing in a draft).
  const billed = cycle && cycle.status !== "DRAFT" ? await getLotRows(session, residenceId, cycle.id) : null;
  const rowByLot = new Map((billed ?? []).map((r) => [r.lotId, r]));
  // Who owns each lot in the cycle on screen — owners change from one cycle to the next.
  const ownerOf = await lotOwnersInCycle(residenceId, lotList, cycle?.id ?? null);
  // A removed owner still shows in the cycles where they own lots (history), nowhere else.
  const holders = new Set(ownerOf.values());
  const shownOwners = allOwners.filter((o) => !o.removed || holders.has(o.id));

  const sortedLots = [...lotList].sort(
    (a, b) =>
      (blocIndex.get(a.buildingId ?? "") ?? -1) - (blocIndex.get(b.buildingId ?? "") ?? -1) ||
      a.code.localeCompare(b.code, "fr", { numeric: true }),
  );
  const toOwnerLot = (lot: (typeof lotList)[number]): OwnerLot => ({
    id: lot.id,
    code: lot.code,
    bloc: lot.buildingId ? (blocName.get(lot.buildingId) ?? "") : "",
    status: rowByLot.get(lot.id)?.status ?? "NONE",
  });

  const items: OwnerItem[] = shownOwners.map((owner) => {
    const held = sortedLots.filter((l) => ownerOf.get(l.id) === owner.id);
    return {
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      lots: held.map(toOwnerLot),
      chargedMillimes: held.reduce(
        (n, l) => n + (rowByLot.get(l.id)?.dueMillimes ?? (billed ? 0 : l.chargeMillimes)),
        0,
      ),
      paidMillimes: held.reduce((n, l) => n + (rowByLot.get(l.id)?.paidMillimes ?? 0), 0),
    };
  });
  // Who owes the most first while a cycle is billed; by name otherwise.
  if (billed) items.sort((a, b) => b.chargedMillimes - b.paidMillimes - (a.chargedMillimes - a.paidMillimes));

  const unassigned = sortedLots.filter((l) => !ownerName.has(ownerOf.get(l.id) ?? "")).map(toOwnerLot);
  const choices: LotChoice[] = sortedLots.map((l) => ({
    id: l.id,
    code: l.code,
    bloc: l.buildingId ? (blocName.get(l.buildingId) ?? "") : "",
    ownerId: ownerOf.get(l.id) ?? null,
    ownerName: ownerName.get(ownerOf.get(l.id) ?? "") ?? null,
  }));

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
        billed={!!billed}
        residenceId={residenceId}
        canManage={can("owners:*")}
        choices={choices}
      />
    </>
  );
}
