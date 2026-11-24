import { describe, expect, it } from "vitest";
import { fitList, flow, fontFor } from "@/lib/print/pdf/fit";

type Line = { kind: "group" | "row" | "total"; name: string; more?: boolean };

/** `groups` groups of `rows` rows each, then a total. */
function list(groups: number, rows: number): Line[] {
  const lines: Line[] = [];
  for (let g = 0; g < groups; g++) {
    lines.push({ kind: "group", name: `G${g}` });
    for (let r = 0; r < rows; r++) lines.push({ kind: "row", name: `G${g}-${r}` });
  }
  lines.push({ kind: "total", name: "total" });
  return lines;
}
const continued = (g: Line): Line => ({ ...g, more: true });
const OPTIONS = { maxColumns: 2, comfortable: 14, readable: 11, min: 7.5 };

describe("flow", () => {
  it("never ends a column on a group band", () => {
    // Capacity 4: G0 + 2 rows, then G1 would be last — it moves on with its first row.
    const chunks = flow(list(2, 2), 4, continued);
    for (const chunk of chunks) expect(chunk[chunk.length - 1].kind).not.toBe("group");
  });

  it("repeats a group's band, marked continued, at the top of the next column", () => {
    const chunks = flow(list(1, 5), 4, continued);
    expect(chunks[1][0]).toEqual({ kind: "group", name: "G0", more: true });
    expect(chunks[1][1].kind).toBe("row");
  });

  it("keeps every line, in order, within capacity", () => {
    const lines = list(5, 9);
    const chunks = flow(lines, 13, continued);
    expect(chunks.every((c) => c.length <= 13)).toBe(true);
    expect(chunks.flat().filter((l) => !l.more)).toEqual(lines);
  });

  it("does not open a column with a continued band before the total", () => {
    const chunks = flow(list(1, 2), 4, continued);
    expect(chunks.map((c) => c.map((l) => l.kind))).toEqual([["group", "row", "row", "total"]]);
    const split = flow(list(1, 3), 4, continued);
    expect(split[1]).toEqual([{ kind: "total", name: "total" }]);
  });
});

describe("fitList", () => {
  it("does not stretch a short list beyond a comfortable row", () => {
    const fit = fitList(list(2, 5), 660, OPTIONS, continued);
    expect(fit).toMatchObject({ columns: 1, row: 14 });
    expect(fit.chunks).toHaveLength(1);
  });

  it("keeps one column while rows stay readable", () => {
    // 51 lines (5 bands, 45 rows, the total) in 660 pt: 12.9 pt rows.
    const fit = fitList(list(5, 9), 660, OPTIONS, continued);
    expect(fit.columns).toBe(1);
    expect(fit.row).toBeCloseTo(660 / 51);
  });

  it("goes to two columns rather than below a readable row", () => {
    // 73 lines would be 9 pt in one column.
    const fit = fitList(list(9, 7), 660, OPTIONS, continued);
    expect(fit.columns).toBe(2);
    expect(fit.chunks).toHaveLength(2);
    expect(fit.row).toBeGreaterThanOrEqual(11);
  });

  it("fits a large residence on one page with small rows", () => {
    // 160 lots in 8 blocs: 169 lines.
    const fit = fitList(list(8, 20), 664, OPTIONS, continued);
    expect(fit.chunks.length).toBeLessThanOrEqual(2);
    expect(fit.row).toBeGreaterThanOrEqual(7.5);
  });

  it("runs on to more pages only past the smallest row", () => {
    const fit = fitList(list(10, 30), 664, OPTIONS, continued);
    expect(fit.columns).toBe(2);
    expect(fit.chunks.length).toBeGreaterThan(2);
    expect(fit.row).toBeGreaterThanOrEqual(7.5);
  });

  it("has nothing to lay out for an empty list", () => {
    expect(fitList([], 660, OPTIONS, continued).chunks).toEqual([]);
  });
});

describe("fontFor", () => {
  it("scales type with the row, between 6 and 8.5 pt", () => {
    expect(fontFor(14)).toBe(8.5);
    expect(fontFor(11)).toBeCloseTo(7.04);
    expect(fontFor(7.5)).toBe(6);
  });
});
