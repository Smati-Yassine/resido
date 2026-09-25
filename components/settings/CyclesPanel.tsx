import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import type { CurrencyCode } from "@/lib/currency";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { formatAmount } from "@/lib/format";
import { toCycleView } from "@/lib/cycle-view";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { getLotRows, totalsFromLotRows } from "@/lib/domain/overview/service";
import { Badge, EmptyState } from "@/components/ui/Display";
import {
  CloseCycleButton,
  DeleteCycleButton,
  NewCycleButton,
  OpenCycleButton,
} from "@/components/workspace/CycleControls";

/** Settings › Cycles: every cycle of the residence, newest first — create, open, close, delete, or jump into one. */
export async function CyclesPanel({
  t,
  session,
  residenceId,
  cycles,
  currency,
  base,
  canManageCycles,
}: {
  t: Dictionary;
  session: AuthorizedSession;
  residenceId: string;
  cycles: Cycle[];
  currency: CurrencyCode;
  base: string;
  canManageCycles: boolean;
}) {
  const treasuries = await computeAllTreasuries(residenceId);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t.cyclesHelp}</p>
        {canManageCycles && <NewCycleButton residenceId={residenceId} />}
      </div>
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
                    Promise.resolve(treasuries.get(cycle.id)!),
                  ])
                : [null, null];
              const hasOpen = cycles.some((c) => c.status === "OPEN");
              return (
                <div
                  key={cycle.id}
                  className="card card-lift grid grid-cols-3 items-center gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]"
                >
                  <div className="col-span-3 flex flex-col gap-1 xl:col-span-1">
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
                  <div className="col-span-3 flex flex-wrap justify-end gap-2 xl:col-span-1">
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
                      <Link href={`${base}?cycle=${cycle.id}`} className="btn btn-ghost">
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
