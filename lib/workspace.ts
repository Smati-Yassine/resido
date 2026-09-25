import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireResidenceSession, requireUser } from "@/lib/session";
import { findResidenceByKey } from "@/lib/domain/residences/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as lots from "@/lib/domain/lots/service";
import { getLotRows } from "@/lib/domain/overview/service";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { withSlugs, type SluggedCycle } from "@/lib/cycle-slugs";

export { withSlugs, type SluggedCycle };
import type { Cycle } from "@/lib/domain/cycles/schema";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";

/** The cycle a residence opens on: the OPEN one, else the most recent. */
export function defaultCycle<C extends Cycle>(list: C[]): C | null {
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
    cycles: withSlugs(cycleList),
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
  // `?cycle=` names a cycle by its slug; an id, from links made before slugs, still works.
  const viewed = loaded.cycles.find((c) => c.slug === cycleParam || c.id === cycleParam);
  const current = defaultCycle(loaded.cycles);
  const cycle = viewed ?? current;
  /**
   * A link inside the residence that keeps the cycle on screen — with no
   * `?cycle=` at all when it is the residence's current one.
   */
  const href = (path = "") => `${loaded.base}${path}${cycle && cycle.id !== current?.id ? `?cycle=${cycle.slug}` : ""}`;
  return { ...loaded, cycle, currency: loaded.residence.currency, href };
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

/**
 * The tab a page shows, from its path (`/finances/payments`, `/settings/cycles`;
 * none = the first tab). A link from before, with `?tab=`, is redirected to
 * that path; an unknown tab is a 404.
 */
export function tabFromPath<T extends string>(
  segments: string[] | undefined,
  tabs: readonly T[],
  legacyTab: string | string[] | undefined,
  hrefFor: (tab: T) => string,
): T {
  if (typeof legacyTab === "string" && tabs.includes(legacyTab as T)) redirect(hrefFor(legacyTab as T));
  if (!segments || segments.length === 0) return tabs[0];
  if (segments.length > 1 || !tabs.includes(segments[0] as T) || segments[0] === tabs[0]) notFound();
  return segments[0] as T;
}
