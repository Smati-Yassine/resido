import { cache } from "react";
import { notFound } from "next/navigation";
import { requireResidenceSession, requireUser } from "@/lib/session";
import * as residences from "@/lib/domain/residences/service";
import * as cycles from "@/lib/domain/cycles/service";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";

/** The cycle a residence opens on: the OPEN one, else the most recent. */
export function defaultCycle(list: Cycle[]): Cycle | null {
  return list.find((c) => c.status === "OPEN") ?? list[0] ?? null;
}

/**
 * Everything a residence page needs to know about where it is: the caller's
 * session in that residence, the residence, its cycles, and which cycle is
 * being viewed (`?cycle=` in the URL, else the default). Memoized per request.
 */
export const loadResidence = cache(async (residenceId: string) => {
  const [user, session] = await Promise.all([requireUser(), requireResidenceSession(residenceId)]);
  const residence = await residences.getResidence(session, residenceId);
  if (!residence.ok) notFound();
  const cycleList = await cycles.listCycles(session, residenceId);
  /** What the viewer's role allows — pages hide the buttons for everything else. */
  const can = (permission: Permission) => roleHasPermission(session.role, permission);
  return { user, session, residence: residence.data, cycles: cycleList.ok ? cycleList.data : [], can };
});

export async function loadWorkspace(
  params: Promise<{ residenceId: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const { residenceId } = await params;
  const { cycle: cycleParam } = await searchParams;
  const base = await loadResidence(residenceId);
  const cycle = base.cycles.find((c) => c.id === cycleParam) ?? defaultCycle(base.cycles);
  return { ...base, residenceId, cycle, currency: base.residence.currency };
}
