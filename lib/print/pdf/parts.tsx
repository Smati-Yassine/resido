import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { C, S } from "./theme";

/** What every printed page knows: language, currency, residence and cycle. */
export interface PdfCtx {
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
  residence: { name: string; city: string };
  cycle: { name: string; status: "DRAFT" | "OPEN" | "CLOSED"; range: string };
  printedOn: string;
}

/** An amount that never breaks across lines: "1 209.760". */
export function money(ctx: PdfCtx, millimes: number) {
  return formatMoney(millimes, ctx.currency).replace(/ /g, " ");
}

/** The same with its currency symbol: "1 209.760 DT". */
export function amount(ctx: PdfCtx, millimes: number) {
  return `${money(ctx, millimes)} ${currencySymbol(ctx.currency)}`;
}

/** The brand mark, light on dark or dark on light. */
export function Mark({ size = 20, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: inverse ? C.onNight : C.night,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: size * 0.56, color: inverse ? C.night : C.onNight }}
      >
        R
      </Text>
    </View>
  );
}

/** The header of every list page; its height is fixed (`SHEET_HEADER`) so the list below can be fitted. */
export const SHEET_HEADER = 46;

export function SheetHeader({ ctx, title }: { ctx: PdfCtx; title: string }) {
  return (
    <View
      style={{
        height: SHEET_HEADER - 10,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        paddingBottom: 8,
        marginBottom: 10,
        borderBottomWidth: 1.5,
        borderBottomColor: C.ink,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        <Mark size={22} />
        <View style={{ flex: 1 }}>
          <Text style={[S.display, { fontSize: 12, maxLines: 1, textOverflow: "ellipsis" }]}>{ctx.residence.name}</Text>
          <Text style={[S.muted, { fontSize: 7.5, maxLines: 1 }]}>{ctx.residence.city}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[S.display, { fontSize: 14 }]}>{title}</Text>
        <Text style={[S.muted, { fontSize: 7.5, marginTop: 1 }]}>
          {ctx.cycle.name} · {ctx.cycle.range}
        </Text>
      </View>
    </View>
  );
}

/** The figures under a list page's header: a ruled strip of fixed height (`FIGURES`). */
export const FIGURES = 52;

export interface Figure {
  label: string;
  value: string;
  unit?: string;
  /** A short line under the value. */
  sub?: string;
  /** Instead of a value: any drawing (a bar and its legend). */
  body?: React.ReactNode;
  flex?: number;
  accent?: string;
}

export function Figures({ figures }: { figures: Figure[] }) {
  return (
    <View
      style={{
        height: FIGURES - 10,
        marginBottom: 10,
        flexDirection: "row",
        borderBottomWidth: 0.75,
        borderBottomColor: C.line,
      }}
    >
      {figures.map((f, i) => (
        <View
          key={f.label}
          style={{
            flex: f.flex ?? 1,
            paddingLeft: i === 0 ? 0 : 10,
            paddingRight: 8,
            borderLeftWidth: i === 0 ? 0 : 0.75,
            borderLeftColor: C.line,
            justifyContent: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {f.accent && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: f.accent }} />}
            <Text style={{ fontSize: 6.3, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>
              {f.label.toUpperCase()}
            </Text>
          </View>
          {f.body ?? (
            <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: 13, marginTop: 2, maxLines: 1 }}>
              {f.value}
              {f.unit && <Text style={{ fontFamily: "Manrope", fontSize: 7, color: C.muted }}> {f.unit}</Text>}
            </Text>
          )}
          {f.sub && (
            <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 1, maxLines: 1, textOverflow: "ellipsis" }}>
              {f.sub}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export interface Column {
  label: string;
  /** Points, or a flex share when `flex` is set. */
  width?: number;
  flex?: number;
  align?: "left" | "right" | "center";
}

type Cell = string | React.ReactElement;

/**
 * One line of a fitted list (lib/print/pdf/fit.ts): a row, one cell per column;
 * or a group band or the total, whose `label` spans the first `span` columns
 * and whose `cells` fill the columns after them (subtotals under their column).
 */
export type ListLine =
  | { kind: "row"; key: string; cells: Cell[] }
  | { kind: "group" | "total"; key: string; label: string; detail?: string; span: number; cells: Cell[] };

function cellStyle(col: Column): Style {
  return {
    ...(col.flex ? { flex: col.flex } : { width: col.width }),
    paddingHorizontal: 3,
    textAlign: col.align ?? "left",
  };
}

const alignOf = (col: Column) =>
  col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start";

/** Columns `from`…`to` taken as one: the same room as they would take side by side. */
function spanStyle(columns: Column[]): Style {
  const fixed = columns.reduce((n, c) => n + (c.flex ? 0 : (c.width ?? 0)), 0);
  const flex = columns.reduce((n, c) => n + (c.flex ?? 0), 0);
  return { flexBasis: fixed, flexGrow: flex, flexShrink: 0, paddingHorizontal: 3 };
}

function CellView({ col, cell, font }: { col: Column; cell: Cell; font: number }) {
  return typeof cell === "string" ? (
    <Text style={[cellStyle(col), { fontSize: font, lineHeight: 1.15, maxLines: 1, textOverflow: "ellipsis" }]}>
      {cell}
    </Text>
  ) : (
    <View style={[cellStyle(col), { alignItems: alignOf(col) }]}>{cell}</View>
  );
}

/** One column of a fitted list: its titles, then its lines, each `row` points tall. */
export function ListColumn({
  columns,
  lines,
  row,
  font,
}: {
  columns: Column[];
  lines: ListLine[];
  row: number;
  font: number;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          height: LIST_HEAD,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: C.ink,
        }}
      >
        {columns.map((col) => (
          <Text
            key={col.label}
            style={[cellStyle(col), { fontSize: 6, fontWeight: 700, color: C.muted, letterSpacing: 0.3, maxLines: 1 }]}
          >
            {col.label.toUpperCase()}
          </Text>
        ))}
      </View>
      {lines.map((line) => {
        if (line.kind === "row") {
          return (
            <View
              key={line.key}
              style={{
                height: row,
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 0.5,
                borderBottomColor: C.lineSoft,
                // Inherited by every cell: a line taller than the row would not be drawn at all.
                fontSize: font,
                lineHeight: 1.15,
              }}
            >
              {line.cells.map((cell, i) => (
                <CellView key={i} col={columns[i]} cell={cell} font={font} />
              ))}
            </View>
          );
        }
        const total = line.kind === "total";
        // The total's rules sit outside its height: within it they would leave its text no room.
        const band: Style = total ? {} : { backgroundColor: C.primarySoft, borderRadius: 2, color: C.night };
        return (
          <View key={line.key}>
            {total && <View style={{ height: 1, backgroundColor: C.ink, marginTop: -1 }} />}
          <View
              style={[{ height: row, flexDirection: "row", alignItems: "center", fontWeight: 800, lineHeight: 1.15 }, band]}
            >
            <View style={[spanStyle(columns.slice(0, line.span)), { flexDirection: "row", gap: 5, alignItems: "center" }]}>
              <Text style={{ fontSize: font, lineHeight: 1.15, fontWeight: 800, maxLines: 1, textOverflow: "ellipsis" }}>
                {line.label}
              </Text>
              {line.detail && (
                <Text
                  style={{
                    fontSize: font * 0.85,
                    lineHeight: 1.15,
                    fontWeight: 600,
                    color: total ? C.muted : C.primary,
                    maxLines: 1,
                  }}
                >
                  {line.detail}
                </Text>
              )}
            </View>
            {line.cells.map((cell, i) => (
              <CellView key={i} col={columns[line.span + i]} cell={cell} font={font} />
            ))}
          </View>
            {total && <View style={{ height: 2, backgroundColor: C.ink }} />}
          </View>
        );
      })}
    </View>
  );
}

/** The height of a list column's titles. */
export const LIST_HEAD = 15;

const PILL: Record<"PAID" | "PARTIAL" | "UNPAID", { bg: string; fg: string }> = {
  PAID: { bg: C.paidBg, fg: C.paidFg },
  PARTIAL: { bg: C.partialBg, fg: C.partialFg },
  UNPAID: { bg: C.unpaidBg, fg: C.unpaidFg },
};

/** A lot's payment status, as the app's badges. */
export function StatusPill({
  status,
  label,
  size = 6.5,
}: {
  status: "PAID" | "PARTIAL" | "UNPAID";
  label: string;
  size?: number;
}) {
  return (
    <Text
      style={{
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.1,
        paddingHorizontal: 4,
        // On the smallest rows the pill loses its padding rather than its text.
        paddingVertical: size < 6 ? 0 : 1,
        borderRadius: 6,
        backgroundColor: PILL[status].bg,
        color: PILL[status].fg,
      }}
    >
      {label}
    </Text>
  );
}

/** A square of colour and its label, for chart legends. */
export function Swatch({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 7.5, color: C.ink2, flex: value ? 1 : undefined }}>{label}</Text>
      {value && <Text style={{ fontSize: 7.5, fontWeight: 700 }}>{value}</Text>}
    </View>
  );
}

/** A small round mark of colour — a payment method in a list. */
export function Dot({ color, size = 5 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** A group's name, or "No block" for lots whose bloc is unknown. */
export function blocLabel(ctx: PdfCtx, name: string) {
  return name || ctx.t.noBloc;
}
