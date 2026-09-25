import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireResidenceSession, requireUser } from "@/lib/session";
import { findResidenceByKey } from "@/lib/domain/residences/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as lots from "@/lib/domain/lots/service";
import { getLotRows } from "@/lib/domain/overview/service";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
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
  // Two round trips, not four: who is signed in and which residence, together;
  // then their membership and its cycles, together. Nothing is returned before
  // the membership is confirmed.
  const [user, found] = await Promise.all([requireUser(), findResidenceByKey(key)]);
  if (!found) notFound();
  const [session, cycleList] = await Promise.all([
    // Membership first: a residence the user cannot open stays a 404, never a redirect that reveals its slug.
    requireResidenceSession(found.residence.id),
    cyclesRepo.listCycles(found.residence.id),
  ]);
  if (!found.canonical) redirect(residencePath(found.residence.slug));
  const residence = found.residence;
  /** What the viewer's role allows — pages hide the buttons for everything else. */
  const can = (permission: Permission) => roleHasPermission(session.role, permission);
  return {
    user,
    session,
    residence,
    residenceId: residence.id,
    /** Base URL of this residence's pages, for links. */
    base: residencePath(residence.slug),
    cycles: cycleList,
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

/**
 * Per-request memos for what both the residence layout and its pages read —
 * the layout's figures (lot count, unpaid badge) come for free to the page.
 */
export const lotRowsFor = cache((session: AuthorizedSession, residenceId: string, cycleId: string) =>
  getLotRows(session, residenceId, cycleId),
);
export const activeLotsFor = cache((session: AuthorizedSession, residenceId: string) =>
  lots.listLots(session, residenceId, { status: "ACTIVE" }),
);
