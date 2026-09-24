import Link from "next/link";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { formatAmount } from "@/lib/format";
import { toCycleView } from "@/lib/cycle-view";
import { computeCycleTreasury } from "@/lib/domain/cycles/service";
import { getLotRows, totalsFromLotRows } from "@/lib/domain/overview/service";
import { Badge, EmptyState, PageHeader } from "@/components/ui/Display";
import {
  CloseCycleButton,
  DeleteCycleButton,
  NewCycleButton,
  OpenCycleButton,
} from "@/components/workspace/CycleControls";

/** Every cycle of the residence, newest first: create, open, close, delete, or jump into one. */
export default async function CyclesPage({ params, searchParams }: PageProps<"/residences/[residenceId]/cycles">) {
  const { session, residenceId, cycles, currency, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();
  const canManageCycles = can("cycles:manage");

  return (
    <>
      <PageHeader
        subtitle={t.cyclesHelp}
        title={t.cycles}
        actions={canManageCycles && <NewCycleButton residenceId={residenceId} />}
      />
      {cycles.length === 0 ? (
        <EmptyState title={t.noCycleTitle} text={t.noCycleText} />
      ) : (
        <div className="flex flex-col gap-3">
          {await Promise.all(
            cycles.map(async (cycle) => {
              const view = toCycleView(cycle, t);
              const billed = cycle.status !== "DRAFT";
              const [totals, treasury] = billed
                ? await Promise.all([
                    getLotRows(session, residenceId, cycle.id).then(totalsFromLotRows),
                    computeCycleTreasury(residenceId, cycle),
                  ])
                : [null, null];
              const hasOpen = cycles.some((c) => c.status === "OPEN");
              return (
                <div
                  key={cycle.id}
                  className="card card-lift grid grid-cols-[1.4fr_1fr_1fr_1fr_350px] items-center gap-4 px-6 py-5"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg font-bold">{cycle.name}</span>
                      <Badge tone={view.badge}>{view.statusLabel}</Badge>
                    </div>
                    <span className="subtle">{view.range}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted">{t.expected}</span>
                    <span className="num font-bold">
                      {totals ? formatAmount(totals.expectedMillimes, currency) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted">{t.collected}</span>
                    <span className="num text-pos font-bold">
                      {totals ? formatAmount(totals.collectedMillimes, currency) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted">{t.endBalance}</span>
                    <span className="num font-bold">
                      {treasury ? formatAmount(treasury.closingBalanceMillimes, currency) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    {canManageCycles && cycle.status === "OPEN" && treasury && (
                      <CloseCycleButton
                        residenceId={residenceId}
                        cycleId={cycle.id}
                        cycleName={cycle.name}
                        closingBalanceMillimes={treasury.closingBalanceMillimes}
                      />
                    )}
                    {canManageCycles && cycle.status === "DRAFT" && !hasOpen && (
                      <OpenCycleButton residenceId={residenceId} cycleId={cycle.id} />
                    )}
                    {billed && (
                      <Link href={`/residences/${residenceId}?cycle=${cycle.id}`} className="btn btn-ghost">
                        {t.view}
                      </Link>
                    )}
                    {canManageCycles && (
                      <DeleteCycleButton residenceId={residenceId} cycleId={cycle.id} cycleName={cycle.name} />
                    )}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      )}
    </>
  );
}
