import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireResidenceSession, requireUser } from "@/lib/session";
import { findResidenceByKey } from "@/lib/domain/residences/repository";
import * as cycles from "@/lib/domain/cycles/service";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";

/** The cycle a residence opens on: the OPEN one, else the most recent. */
export function defaultCycle(list: Cycle[]): Cycle | null {
  return list.find((c) => c.status === "OPEN") ?? list[0] ?? null;
}

/** The URL of a residence page: `/residences/<slug>` plus an optional section path. */
export function residencePath(slug: string, path = ""): string {
  return `/residences/${slug}${path}`;
}

/**
 * Everything a residence page needs to know about where it is. `key` is the
 * URL segment: the residence's slug — or an old slug / its id from an older
 * link, which redirect to the current slug. The session and every domain call
 * use the real id; only URLs use the slug. Memoized per request.
 */
export const loadResidence = cache(async (key: string) => {
  const user = await requireUser();
  const found = await findResidenceByKey(key);
  if (!found) notFound();
  // Membership first: a residence the user cannot open stays a 404, never a redirect that reveals its slug.
  const session = await requireResidenceSession(found.residence.id);
  if (!found.canonical) redirect(residencePath(found.residence.slug));
  const residence = found.residence;
  const cycleList = await cycles.listCycles(session, residence.id);
  /** What the viewer's role allows — pages hide the buttons for everything else. */
  const can = (permission: Permission) => roleHasPermission(session.role, permission);
  return {
    user,
    session,
    residence,
    residenceId: residence.id,
    /** Base URL of this residence's pages, for links. */
    base: residencePath(residence.slug),
    cycles: cycleList.ok ? cycleList.data : [],
    can,
  };
});

export async function loadWorkspace(
  params: Promise<{ residenceId: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const { residenceId: key } = await params;
  const { cycle: cycleParam } = await searchParams;
  const loaded = await loadResidence(key);
  const cycle = loaded.cycles.find((c) => c.id === cycleParam) ?? defaultCycle(loaded.cycles);
  return { ...loaded, cycle, currency: loaded.residence.currency };
}
