/**
 * Fitting a list on one page. The printed lists (lots, payments, expenses)
 * are lines of one fixed height: group bands (a bloc, a month — with their
 * subtotal), rows, and a closing total. Rather than letting a table run on
 * from page to page, the page picks its row height and its number of side-by-
 * side columns from the number of lines: as few columns as possible, rows as
 * tall as they fit (never taller than `comfortable`). Only a list too long to
 * stay legible on one page — rows under `min` even in `maxColumns` columns —
 * runs to further pages, laid out the same way.
 *
 * Pure: the layout is decided before rendering, so it is exact and testable.
 */

export type FitLine = { kind: "group" | "row" | "total" };

export interface FitOptions {
  /** How many side-by-side columns the page may use. */
  maxColumns: number;
  /** Tallest row, in points: short lists are not stretched beyond it. */
  comfortable: number;
  /** A row this tall is still easy to read: fewer columns are preferred only down to it. */
  readable: number;
  /** The smallest row allowed; below it the list runs to another page. */
  min: number;
}

export interface Fit<L> {
  /** Columns per page (the last page may use fewer). */
  columns: number;
  /** Row height, in points. */
  row: number;
  /** The lines of each column, page after page — `columns` per page. */
  chunks: L[][];
}

/**
 * Pours the lines into columns of `capacity` lines. A group band is never the
 * last line of a column (it moves on with its first row), and a group that
 * goes on in the next column opens it with its band again, via `continued`.
 */
export function flow<L extends FitLine>(lines: L[], capacity: number, continued: (group: L) => L): L[][] {
  if (capacity < 2) throw new Error("A column must hold at least two lines");
  const chunks: L[][] = [];
  let current: L[] = [];
  let group: L | null = null;
  const next = (upcoming: L) => {
    chunks.push(current);
    current = group && upcoming.kind === "row" ? [continued(group)] : [];
  };
  for (const line of lines) {
    const room = capacity - current.length;
    if (room <= 0 || (line.kind === "group" && room < 2)) next(line);
    if (line.kind === "group") group = line;
    if (line.kind === "total") group = null;
    current.push(line);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Row height and columns for `lines` in a column `height` points tall (see the top of this file). */
export function fitList<L extends FitLine>(
  lines: L[],
  height: number,
  options: FitOptions,
  continued: (group: L) => L,
): Fit<L> {
  const { maxColumns, comfortable, readable, min } = options;
  if (lines.length === 0) return { columns: 1, row: comfortable, chunks: [] };
  for (const floor of [readable, min]) {
    const most = Math.floor(height / floor);
    if (most < 2) continue;
    for (let columns = 1; columns <= maxColumns; columns++) {
      if (flow(lines, most, continued).length > columns) continue;
      // The fewest lines per column that still fit in `columns`: the tallest rows.
      let capacity = Math.max(2, Math.ceil(lines.length / columns));
      while (flow(lines, capacity, continued).length > columns) capacity++;
      return { columns, row: Math.min(comfortable, height / capacity), chunks: flow(lines, capacity, continued) };
    }
  }
  const capacity = Math.max(2, Math.floor(height / min));
  return { columns: maxColumns, row: height / capacity, chunks: flow(lines, capacity, continued) };
}

/** The type size for a row height: 8.5 pt at most, 6 pt at least. */
export function fontFor(row: number) {
  return Math.max(6, Math.min(8.5, row * 0.64));
}
