import { loadWorkspace, lotRowsFor, activeLotsFor } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import * as buildings from "@/lib/domain/buildings/service";
import * as owners from "@/lib/domain/owners/service";
import { EmptyState, PageHeader } from "@/components/ui/Display";
import { ClosedBanner } from "@/components/workspace/CycleState";
import { AddLotButton, NewBlocButton } from "@/components/workspace/LotModals";
import { LotsBoard, type LotItem } from "@/components/lots/LotsBoard";

/** The residence's lots for the cycle on screen: figures, blocs, search and filters, then the table. */
export default async function LotsPage({ params, searchParams }: PageProps<"/residences/[residenceId]/lots">) {
  const { session, residenceId, cycle, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();

  const [blocResult, lotResult, ownerResult, billed] = await Promise.all([
    buildings.listBuildings(session, residenceId),
    activeLotsFor(session, residenceId),
    owners.listOwners(session, residenceId),
    cycle && cycle.status !== "DRAFT" ? lotRowsFor(session, residenceId, cycle.id) : Promise.resolve(null),
  ]);
  const blocs = (blocResult.ok ? blocResult.data : []).map((b) => ({ id: b.id, name: b.name }));
  const lotList = lotResult.ok ? lotResult.data : [];
  const ownerList = ownerResult.ok ? ownerResult.data : [];
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));
  const ownerName = new Map(ownerList.map((o) => [o.id, o.name]));
  const rowByLot = new Map((billed ?? []).map((r) => [r.lotId, r]));

  // In a billed cycle: the lots it bills, with that cycle's charge and owner. Otherwise the lots themselves.
  const items: LotItem[] = (billed ? lotList.filter((l) => rowByLot.has(l.id)) : lotList).map((lot) => {
    const row = rowByLot.get(lot.id);
    const ownerId = row ? row.ownerId : lot.ownerId;
    return {
      id: lot.id,
      code: lot.code,
      blocId: lot.buildingId,
      blocName: lot.buildingId ? (blocName.get(lot.buildingId) ?? "") : "",
      ownerName: ownerId ? (ownerName.get(ownerId) ?? null) : null,
      chargeMillimes: row?.dueMillimes ?? lot.chargeMillimes,
      paidMillimes: row ? row.paidMillimes : null,
      status: row?.status ?? null,
      edit: {
        id: lot.id,
        code: lot.code,
        buildingId: lot.buildingId,
        chargeMillimes: row?.dueMillimes ?? lot.chargeMillimes,
        ownerId,
      },
    };
  });
  // Keep the bloc order, then codes in natural order (A2 before A10).
  const blocIndex = new Map(blocs.map((b, i) => [b.id, i]));
  items.sort(
    (a, b) =>
      (blocIndex.get(a.blocId ?? "") ?? -1) - (blocIndex.get(b.blocId ?? "") ?? -1) ||
      a.code.localeCompare(b.code, "fr", { numeric: true }),
  );

  // A removed owner is offered only in the cycles where they still own lots.
  const holders = new Set(billed ? billed.map((r) => r.ownerId) : lotList.map((l) => l.ownerId));
  const ownerOptions = ownerList
    .filter((o) => !o.removed || holders.has(o.id))
    .map((o) => ({ id: o.id, name: o.name }));
  const canEdit = can("lots:*");

  return (
    <>
      {cycle && <ClosedBanner cycle={cycle} t={t} />}
      <PageHeader
        subtitle={interpolate(t.lotsSubtitle, { lots: items.length, blocs: blocs.length })}
        title={t.lots}
        actions={
          canEdit && (
            <>
              <NewBlocButton residenceId={residenceId} />
              {blocs.length > 0 && <AddLotButton residenceId={residenceId} blocs={blocs} owners={ownerOptions} />}
            </>
          )
        }
      />
      {blocs.length === 0 ? (
        <EmptyState title={t.noBlocsTitle} text={t.noBlocsText} />
      ) : (
        <>
          {cycle?.status === "DRAFT" && <p className="text-muted">{t.noChargesDraft}</p>}
          <LotsBoard
            items={items}
            blocs={blocs}
            billed={!!billed}
            residenceId={residenceId}
            canEdit={canEdit}
            owners={ownerOptions}
          />
        </>
      )}
    </>
  );
}
