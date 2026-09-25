import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { interpolate, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
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

/** The header repeated at the top of every table page. */
export function SheetHeader({ ctx, title }: { ctx: PdfCtx; title: string }) {
  return (
    <View
      fixed
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingBottom: 8,
        marginBottom: 10,
        borderBottomWidth: 1.5,
        borderBottomColor: C.ink,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Mark size={22} />
        <View>
          <Text style={[S.display, { fontSize: 12 }]}>{ctx.residence.name}</Text>
          <Text style={[S.muted, { fontSize: 7.5 }]}>{ctx.residence.city}</Text>
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

/** Printed date, brand and page numbers, at the foot of every page. */
export function Footer({ ctx }: { ctx: PdfCtx }) {
  return (
    <View fixed style={S.footer}>
      <Text>
        {ctx.residence.name} · {ctx.cycle.name} · {interpolate(ctx.t.printedOn, { date: ctx.printedOn })}
      </Text>
      <Text>{ctx.t.generatedBy}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          interpolate(ctx.t.pageOf, { page: pageNumber, total: totalPages ?? pageNumber })
        }
      />
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

function cellStyle(col: Column): Style {
  return {
    ...(col.flex ? { flex: col.flex } : { width: col.width }),
    paddingHorizontal: 4,
    textAlign: col.align ?? "left",
  };
}

/** Column titles — `fixed`, so they repeat on every page the table runs to. */
export function TableHead({ columns }: { columns: Column[] }) {
  return (
    <View
      fixed
      style={{
        flexDirection: "row",
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: C.ink,
      }}
    >
      {columns.map((col) => (
        <Text
          key={col.label}
          style={[cellStyle(col), { fontSize: 6.5, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }]}
        >
          {col.label.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

type Cell = string | React.ReactElement;
export type RowKind = "row" | "subtotal" | "total";

/** One line of a table; rows never split across pages. */
export function TableRow({ columns, cells, kind = "row" }: { columns: Column[]; cells: Cell[]; kind?: RowKind }) {
  const band: Style =
    kind === "subtotal"
      ? { backgroundColor: C.surface2, fontWeight: 700, borderBottomColor: C.line }
      : kind === "total"
        ? {
            fontWeight: 800,
            fontSize: 9,
            borderTopWidth: 1,
            borderTopColor: C.ink,
            borderBottomWidth: 2.5,
            borderBottomColor: C.ink,
            paddingVertical: 6,
          }
        : {};
  return (
    <View
      wrap={false}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 4,
          borderBottomWidth: 0.5,
          borderBottomColor: C.lineSoft,
        },
        band,
      ]}
    >
      {cells.map((cell, i) =>
        typeof cell === "string" ? (
          <Text key={i} style={cellStyle(columns[i])}>
            {cell}
          </Text>
        ) : (
          <View key={i} style={[cellStyle(columns[i]), { alignItems: alignOf(columns[i]) }]}>
            {cell}
          </View>
        ),
      )}
    </View>
  );
}

function alignOf(col: Column) {
  return col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start";
}

/** A band opening a group (a bloc, a month); kept with the row after it. */
export function GroupRow({ label, detail }: { label: string; detail?: string }) {
  return (
    <View
      wrap={false}
      minPresenceAhead={30}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 6,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 3,
        backgroundColor: C.primarySoft,
        color: C.night,
      }}
    >
      <Text style={{ fontWeight: 800 }}>{label}</Text>
      {detail && <Text style={{ color: C.primary, fontWeight: 600 }}>{detail}</Text>}
    </View>
  );
}

const PILL: Record<"PAID" | "PARTIAL" | "UNPAID", { bg: string; fg: string }> = {
  PAID: { bg: C.paidBg, fg: C.paidFg },
  PARTIAL: { bg: C.partialBg, fg: C.partialFg },
  UNPAID: { bg: C.unpaidBg, fg: C.unpaidFg },
};

/** A lot's payment status, as the app's badges. */
export function StatusPill({ status, label }: { status: "PAID" | "PARTIAL" | "UNPAID"; label: string }) {
  return (
    <Text
      style={{
        fontSize: 6.5,
        fontWeight: 700,
        paddingHorizontal: 5,
        paddingVertical: 1.5,
        borderRadius: 6,
        backgroundColor: PILL[status].bg,
        color: PILL[status].fg,
      }}
    >
      {label}
    </Text>
  );
}

/** Change against the previous cycle: ↑ 12 % vs 2025, green when it is good news. */
export function Delta({ change, vs, goodWhenUp }: { change: number | null; vs: string; goodWhenUp: boolean }) {
  if (change === null) return <Text style={{ fontSize: 6.5, color: C.muted }}>{vs}</Text>;
  const up = change > 0;
  const good = change === 0 ? null : up === goodWhenUp;
  const color = good === null ? C.muted : good ? C.pos : C.neg;
  return (
    <Text style={{ fontSize: 6.5, color: C.muted }}>
      <Text style={{ color, fontWeight: 800 }}>
        {change === 0 ? "=" : up ? "↑" : "↓"} {Math.abs(change)} %
      </Text>{" "}
      {vs}
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
