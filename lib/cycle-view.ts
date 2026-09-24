import type { Cycle, CycleStatus } from "@/lib/domain/cycles/schema";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/format";
import type { BadgeTone } from "@/components/ui/Display";

/** What the UI shows for a cycle, precomputed on the server so client components stay locale-agnostic. */
export interface CycleView {
  id: string;
  name: string;
  status: CycleStatus;
  statusLabel: string;
  badge: BadgeTone;
  range: string;
}

export const CYCLE_BADGE: Record<CycleStatus, BadgeTone> = { OPEN: "open", CLOSED: "closed", DRAFT: "draft" };

export function cycleRange(cycle: Cycle, t: Dictionary): string {
  const start = formatDate(cycle.startDate);
  return cycle.endDate ? `${start} → ${formatDate(cycle.endDate)}` : interpolate(t.sinceNoEnd, { start });
}

export function toCycleView(cycle: Cycle, t: Dictionary): CycleView {
  return {
    id: cycle.id,
    name: cycle.name,
    status: cycle.status,
    statusLabel: t[`status${cycle.status}`],
    badge: CYCLE_BADGE[cycle.status],
    range: cycleRange(cycle, t),
  };
}
