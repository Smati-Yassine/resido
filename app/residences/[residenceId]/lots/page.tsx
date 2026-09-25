import { loadWorkspace } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import * as buildings from "@/lib/domain/buildings/service";
import * as lots from "@/lib/domain/lots/service";
import * as owners from "@/lib/domain/owners/service";
import { getLotRows, type LotPaymentStatus } from "@/lib/domain/overview/service";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@/components/ui/Display";
import { Icon } from "@/components/ui/Icon";
import { ClosedBanner } from "@/components/workspace/CycleState";
import { AddLotButton, NewBlocButton } from "@/components/workspace/LotModals";
import { LotRowActions } from "@/components/workspace/LotRowActions";

const STATUS_TONE: Record<LotPaymentStatus, BadgeTone> = { PAID: "paid", PARTIAL: "partial", UNPAID: "unpaid" };

export default async function LotsPage({ params, searchParams }: PageProps<"/residences/[residenceId]/lots">) {
  const { session, residenceId, cycle, currency, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();

  const [blocResult, lotResult, ownerResult] = await Promise.all([
    buildings.listBuildings(session, residenceId),
    lots.listLots(session, residenceId, { status: "ACTIVE" }),
    owners.listOwners(session, residenceId),
  ]);
  const ownerOptions = (ownerResult.ok ? ownerResult.data : []).map((o) => ({ id: o.id, name: o.name }));
  const blocs = blocResult.ok ? blocResult.data : [];
  const lotList = lotResult.ok ? lotResult.data : [];
  const billed = cycle && cycle.status !== "DRAFT" ? await getLotRows(session, residenceId, cycle.id) : null;
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));

  // Lot changes are for roles that manage lots; the owner is changed only through Edit.
  const canEdit = can("lots:*");
  const blocOptions = blocs.map((b) => ({ id: b.id, name: b.name }));
  const lotById = new Map(lotList.map((l) => [l.id, l]));
  const ownerName = (id?: string | null) => ownerOptions.find((o) => o.id === id)?.name;
  const billedGrid = canEdit
    ? "grid-cols-[minmax(104px,1fr)_minmax(0,0.7fr)_minmax(0,1.5fr)_repeat(3,minmax(0,1.1fr))_minmax(0,0.9fr)_84px]"
    : "grid-cols-[minmax(104px,1fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_repeat(3,minmax(0,1.1fr))_minmax(0,0.9fr)]";
  const plainGrid = canEdit ? "grid-cols-[minmax(104px,1fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_84px]" : "grid-cols-[minmax(104px,1fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1.3fr)]";
  // The edit form starts from the cycle on screen: its charge and its owner for the lot.
  const rowByLot = new Map((billed ?? []).map((r) => [r.lotId, r]));
  const editable = (lotId: string) => {
    const lot = lotById.get(lotId);
    if (!lot) return <span />;
    const row = rowByLot.get(lotId);
    return (
      <LotRowActions
        residenceId={residenceId}
        blocs={blocOptions}
        owners={ownerOptions}
        lot={{
          id: lot.id,
          code: lot.code,
          buildingId: lot.buildingId,
          chargeMillimes: row?.dueMillimes ?? lot.chargeMillimes,
          ownerId: row ? row.ownerId : lot.ownerId,
        }}
      />
    );
  };

  return (
    <>
      {cycle && <ClosedBanner cycle={cycle} t={t} />}
      <PageHeader
        subtitle={interpolate(t.lotsSubtitle, { lots: lotList.length, blocs: blocs.length })}
        title={t.lots}
        actions={
          can("lots:*") && (
            <>
              <NewBlocButton residenceId={residenceId} />
              {blocs.length > 0 && (
                <AddLotButton
                  residenceId={residenceId}
                  blocs={blocs.map((b) => ({ id: b.id, name: b.name }))}
                  owners={ownerOptions}
                />
              )}
            </>
          )
        }
      />

      {blocs.length === 0 ? (
        <EmptyState title={t.noBlocsTitle} text={t.noBlocsText} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <span className="label-caps">{t.blocs}</span>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {blocs.map((b) => {
              const count = lotList.filter((l) => l.buildingId === b.id).length;
              return (
                <div key={b.id} className="card flex flex-col gap-1 px-4 py-3.5">
                  <span className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="text-primary">
                      <Icon name="bloc" size={16} />
                    </span>
                    {b.name}
                  </span>
                  <span className="subtle">{count ? `${count} ${t.lotsWord}` : t.emptyBloc}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {billed ? (
        <div className="card data-table">
          <div className={`data-head ${billedGrid}`}>
            <span>{t.colLot}</span>
            <span>{t.colBloc}</span>
            <span>{t.colOwner}</span>
            <span className="text-right">{t.colCharge}</span>
            <span className="text-right">{t.colPaid}</span>
            <span className="text-right">{t.colRemaining}</span>
            <span className="text-right">{t.colStatus}</span>
            {canEdit && <span />}
          </div>
          {billed.map((row) => (
            <div key={row.assessmentId} className={`data-row num ${billedGrid}`}>
              <span className="font-bold whitespace-normal">{row.code}</span>
              <span className="text-muted">{row.blocName}</span>
              <span className="truncate text-ink-2" title={row.ownerName ?? undefined}>
                {row.ownerName ?? "—"}
              </span>
              <span className="text-right">{formatMoney(row.dueMillimes, currency)}</span>
              <span className="text-pos text-right">{formatMoney(row.paidMillimes, currency)}</span>
              <span className="text-right font-semibold">
                {formatMoney(row.dueMillimes - row.paidMillimes, currency)}
              </span>
              <span className="text-right">
                <Badge tone={STATUS_TONE[row.status]}>{t[`status${row.status}`]}</Badge>
              </span>
              {canEdit && editable(row.lotId)}
            </div>
          ))}
        </div>
      ) : (
        lotList.length > 0 && (
          <>
            {cycle?.status === "DRAFT" && <p className="text-muted">{t.noChargesDraft}</p>}
            <div className="card data-table">
              <div className={`data-head ${plainGrid}`}>
                <span>{t.colLot}</span>
                <span>{t.colBloc}</span>
                <span>{t.colOwner}</span>
                <span className="text-right">{interpolate(t.annualCharge, { cur: currencySymbol(currency) })}</span>
                {canEdit && <span />}
              </div>
              {lotList.map((lot) => (
                <div key={lot.id} className={`data-row num ${plainGrid}`}>
                  <span className="font-bold whitespace-normal">{lot.code}</span>
                  <span className="text-muted">{lot.buildingId ? blocName.get(lot.buildingId) : ""}</span>
                  <span className="truncate text-ink-2" title={ownerName(lot.ownerId)}>
                    {ownerName(lot.ownerId) ?? "—"}
                  </span>
                  <span className="text-right">{formatMoney(lot.chargeMillimes, currency)}</span>
                  {canEdit && editable(lot.id)}
                </div>
              ))}
            </div>
          </>
        )
      )}
    </>
  );
}
