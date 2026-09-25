import type { Cycle } from "@/lib/domain/cycles/schema";
import { slugify } from "@/lib/text";

/** A cycle with the name it goes by in URLs (`?cycle=2026-2027`). */
export type SluggedCycle = Cycle & { slug: string };

/**
 * URL names for a residence's cycles, from their names ("Cycle 2026" →
 * "cycle-2026"); a name used twice gets -2, -3… in date order, so a link keeps
 * pointing at the same cycle when a later one takes the same name.
 */
export function withSlugs(list: Cycle[]): SluggedCycle[] {
  const taken = new Set<string>();
  const slugs = new Map<string, string>();
  for (const cycle of [...list].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
    const base = slugify(cycle.name, "cycle");
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    slugs.set(cycle.id, slug);
  }
  return list.map((c) => ({ ...c, slug: slugs.get(c.id)! }));
}
