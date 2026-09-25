import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import * as owners from "@/lib/domain/owners/service";
import * as lots from "@/lib/domain/lots/service";
import * as buildings from "@/lib/domain/buildings/service";
import { getLotRows } from "@/lib/domain/overview/service";
import { lotOwnersInCycle } from "@/lib/domain/lots/ownership";
import { EmptyState, PageHeader } from "@/components/ui/Display";
import { NewOwnerButton, OwnerRowActions, type LotChoice } from "@/components/workspace/OwnerModals";

export default async function OwnersPage({ params, searchParams }: PageProps<"/residences/[residenceId]/owners">) {
  const { session, residenceId, cycle, currency, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();

  const [ownerResult, lotResult, blocResult] = await Promise.all([
    owners.listOwners(session, residenceId),
    lots.listLots(session, residenceId, { status: "ACTIVE" }),
    buildings.listBuildings(session, residenceId),
  ]);
  const allOwners = ownerResult.ok ? ownerResult.data : [];
  const lotList = lotResult.ok ? lotResult.data : [];
  const blocName = new Map((blocResult.ok ? blocResult.data : []).map((b) => [b.id, b.name]));
  const ownerName = new Map(allOwners.map((o) => [o.id, o.name]));
  // What each lot still owes in the cycle being viewed (nothing billed in a draft).
  const rows = cycle && cycle.status !== "DRAFT" ? await getLotRows(session, residenceId, cycle.id) : [];
  const dueByLot = new Map(rows.map((r) => [r.lotId, r.dueMillimes - r.paidMillimes]));
  // Who owns each lot in the cycle on screen — owners change from one cycle to the next.
  const ownerOf = await lotOwnersInCycle(residenceId, lotList, cycle?.id ?? null);
  // A removed owner still shows in the cycles where they own lots (history), nowhere else.
  const holders = new Set(ownerOf.values());
  const ownerList = allOwners.filter((o) => !o.removed || holders.has(o.id));

  const choices: LotChoice[] = lotList.map((l) => ({
    id: l.id,
    code: l.code,
    bloc: l.buildingId ? (blocName.get(l.buildingId) ?? "") : "",
    ownerId: ownerOf.get(l.id) ?? null,
    ownerName: ownerName.get(ownerOf.get(l.id) ?? "") ?? null,
  }));
  const assigned = lotList.filter((l) => ownerName.has(ownerOf.get(l.id) ?? "")).length;

  return (
    <>
      <PageHeader
        subtitle={interpolate(t.ownersSubtitle, { count: ownerList.length, lots: assigned, total: lotList.length })}
        title={t.owners}
        actions={can("owners:*") && <NewOwnerButton residenceId={residenceId} lots={choices} />}
      />
      {ownerList.length === 0 ? (
        <EmptyState title={t.noOwnersTitle} text={t.noOwnersText} />
      ) : (
        <div className="card data-table">
          <div className="data-head grid-cols-[1.3fr_1fr_2fr_140px_96px]">
            <span>{t.ownerName}</span>
            <span>{t.colPhone}</span>
            <span>{t.colLots}</span>
            <span className="text-right">{t.colDue}</span>
            <span />
          </div>
          {ownerList.map((owner) => {
            const held = lotList.filter((l) => ownerOf.get(l.id) === owner.id);
            const due = held.reduce((sum, l) => sum + (dueByLot.get(l.id) ?? 0), 0);
            return (
              <div key={owner.id} className="data-row grid-cols-[1.3fr_1fr_2fr_140px_96px]">
                <span className="font-bold">{owner.name}</span>
                <span className="text-muted">{owner.phone ?? "—"}</span>
                <span className="text-ink-2">{held.map((l) => l.code).join(", ") || "—"}</span>
                <span className={`num text-right font-semibold ${due > 0 ? "text-neg" : "text-pos"}`}>
                  {formatMoney(due, currency)}
                </span>
                {can("owners:*") ? (
                  <OwnerRowActions
                    residenceId={residenceId}
                    lots={choices}
                    owner={{ id: owner.id, name: owner.name, phone: owner.phone, lotIds: held.map((l) => l.id) }}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
