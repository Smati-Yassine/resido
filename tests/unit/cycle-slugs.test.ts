import { describe, expect, it } from "vitest";
import { withSlugs } from "@/lib/cycle-slugs";
import type { Cycle } from "@/lib/domain/cycles/schema";

const cycle = (id: string, name: string, start: string) => ({ id, name, startDate: new Date(start) }) as Cycle;

describe("cycle slugs", () => {
  it("names each cycle in URLs by its name, a repeated name numbered in date order", () => {
    const slugs = withSlugs([
      cycle("c", "Cycle 2026", "2026-01-01"),
      cycle("b", "Année 2025/2026", "2025-01-01"),
      cycle("a", "Cycle 2026", "2024-01-01"),
    ]).map((c) => [c.id, c.slug]);
    expect(slugs).toEqual([
      ["c", "cycle-2026-2"],
      ["b", "annee-2025-2026"],
      ["a", "cycle-2026"],
    ]);
  });
});
