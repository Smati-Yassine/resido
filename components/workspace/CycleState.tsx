import Link from "next/link";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { EmptyState, Notice } from "@/components/ui/Display";
import { NewCycleButton } from "./CycleControls";

/** Shown on every section while viewing a CLOSED cycle. */
export function ClosedBanner({ cycle, t }: { cycle: Cycle; t: Dictionary }) {
  if (cycle.status !== "CLOSED") return null;
  return (
    <Notice icon="lock" tone="muted">
      <b>{interpolate(t.closedBanner, { name: cycle.name })}</b> {t.closedBannerText}
    </Notice>
  );
}

export function NoCycle({
  residenceId,
  base,
  t,
  canCreate,
}: {
  residenceId: string;
  base: string;
  t: Dictionary;
  canCreate: boolean;
}) {
  return (
    <EmptyState title={t.noCycleTitle} text={t.noCycleText}>
      <div className="mt-2 flex gap-2.5">
        <Link href={`${base}/lots`} className="btn btn-ghost">
          {t.lots}
        </Link>
        {canCreate && <NewCycleButton residenceId={residenceId} label={t.createFirstCycle} />}
      </div>
    </EmptyState>
  );
}

export function DraftCycle({ base, cycle, t }: { base: string; cycle: Cycle; t: Dictionary }) {
  return (
    <EmptyState title={interpolate(t.draftTitle, { name: cycle.name })} text={t.draftText}>
      <div className="mt-2 flex gap-2.5">
        <Link href={`${base}`} className="btn btn-ghost">
          {t.viewCurrentCycle}
        </Link>
        <Link href={`${base}/cycles?cycle=${cycle.id}`} className="btn btn-primary">
          {t.cycles}
        </Link>
      </div>
    </EmptyState>
  );
}
