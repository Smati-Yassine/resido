import { Circle, G, Line, Path, Polyline, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { C } from "./theme";

/** A point on a circle, angle in degrees clockwise from 12 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * The collection gauge of the report's cover: a 270° ring on the night
 * band, the rate in its middle.
 */
export function Gauge({
  value,
  size,
  label,
  caption,
}: {
  value: number;
  size: number;
  label: string;
  caption: string;
}) {
  const stroke = size * 0.085;
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const clamped = Math.max(0, Math.min(100, value));
  const start = -135;
  const end = start + (270 * clamped) / 100;
  return (
    <View style={{ width: size, position: "relative" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={arc(c, c, r, start, 135)}
          stroke={C.nightLine}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        {clamped > 0 && (
          <Path
            d={arc(c, c, r, start, Math.max(end, start + 0.5))}
            stroke={C.nightPos}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {/* Ticks every 25 %. */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const deg = start + (270 * tick) / 100;
          const a = polar(c, c, r - stroke / 2 - 3, deg);
          const b = polar(c, c, r - stroke / 2 - 7, deg);
          return <Line key={tick} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.nightMuted} strokeWidth={0.8} />;
        })}
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: size * 0.24, color: C.onNight }}>
          {clamped}
          <Text style={{ fontSize: size * 0.12 }}> %</Text>
        </Text>
        <Text style={{ fontSize: 7, color: C.nightInk, marginTop: 2, letterSpacing: 0.4 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 7, fontWeight: 700, color: C.nightPos, textAlign: "center", marginTop: -size * 0.13 }}>
        {caption}
      </Text>
    </View>
  );
}

/** A ring split into shares, with the total in the middle. */
export function Donut({
  parts,
  size,
  center,
  centerLabel,
}: {
  parts: { value: number; color: string }[];
  size: number;
  center: string;
  centerLabel: string;
}) {
  const stroke = size * 0.16;
  const r = size / 2 - stroke / 2;
  const c = size / 2;
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  let at = 0;
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={r} stroke={C.lineSoft} strokeWidth={stroke} fill="none" />
        {total > 0 &&
          (shown.length === 1 ? (
            <Circle cx={c} cy={c} r={r} stroke={shown[0].color} strokeWidth={stroke} fill="none" />
          ) : (
            shown.map((p, i) => {
              const from = (at / total) * 360;
              at += p.value;
              const to = (at / total) * 360;
              // A hair of white between segments.
              return (
                <Path
                  key={i}
                  d={arc(c, c, r, from + 1.2, Math.max(to - 1.2, from + 1.3))}
                  stroke={p.color}
                  strokeWidth={stroke}
                  fill="none"
                />
              );
            })
          ))}
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: "Fraunces", fontWeight: 700, fontSize: size * 0.2 }}>{center}</Text>
        <Text style={{ fontSize: 6.5, color: C.muted }}>{centerLabel}</Text>
      </View>
    </View>
  );
}

export interface WaterfallStep {
  label: string;
  value: string;
  /** Where the bar starts and ends, in millimes. */
  from: number;
  to: number;
  color: string;
}

/** Opening → + in → − out → balance: floating bars on one scale, zero drawn when crossed. */
export function Waterfall({ steps, width, height }: { steps: WaterfallStep[]; width: number; height: number }) {
  const values = steps.flatMap((s) => [s.from, s.to]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const slot = width / steps.length;
  const bar = slot * 0.52;
  return (
    <View style={{ width }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={f}
            x1={0}
            x2={width}
            y1={height * f}
            y2={height * f}
            stroke={C.lineSoft}
            strokeWidth={0.6}
            strokeDasharray="2 2"
          />
        ))}
        <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={C.stone} strokeWidth={0.8} />
        {steps.map((s, i) => {
          const x = slot * i + (slot - bar) / 2;
          const top = Math.min(y(s.from), y(s.to));
          const h = Math.max(1.5, Math.abs(y(s.from) - y(s.to)));
          const next = steps[i + 1];
          return (
            <G key={s.label}>
              <Rect x={x} y={top} width={bar} height={h} fill={s.color} rx={2} ry={2} />
              {next && (
                <Line
                  x1={x + bar}
                  x2={slot * (i + 1) + (slot - bar) / 2}
                  y1={y(s.to)}
                  y2={y(s.to)}
                  stroke={C.muted}
                  strokeWidth={0.6}
                  strokeDasharray="1.5 1.5"
                />
              )}
            </G>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {steps.map((s) => (
          <View key={s.label} style={{ width: slot, alignItems: "center" }}>
            <Text style={{ fontSize: 6.5, color: C.muted, textAlign: "center" }}>{s.label}</Text>
            <Text style={{ fontSize: 8, fontWeight: 800, color: s.color, marginTop: 1, textAlign: "center" }}>
              {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Money in and out by month as paired bars, the running balance as a line over them. */
export function FlowsChart({
  months,
  width,
  height,
}: {
  months: { label: string; income: number; expense: number; balance: number }[];
  width: number;
  height: number;
}) {
  const values = months.flatMap((m) => [m.income, m.expense, m.balance]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const y = (v: number) => 4 + (height - 8) * (1 - (v - min) / (max - min));
  const slot = width / Math.max(1, months.length);
  const bar = Math.min(14, slot * 0.28);
  const points = months.map((m, i) => `${(slot * i + slot / 2).toFixed(2)},${y(m.balance).toFixed(2)}`).join(" ");
  return (
    <View style={{ width }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={f}
            x1={0}
            x2={width}
            y1={height * f}
            y2={height * f}
            stroke={C.lineSoft}
            strokeWidth={0.6}
            strokeDasharray="2 2"
          />
        ))}
        <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={C.stone} strokeWidth={0.8} />
        {months.map((m, i) => {
          const cx = slot * i + slot / 2;
          return (
            <G key={m.label}>
              <Rect
                x={cx - bar - 1}
                y={Math.min(y(m.income), y(0))}
                width={bar}
                height={Math.max(0.8, Math.abs(y(0) - y(m.income)))}
                fill={C.olive}
                rx={1.5}
                ry={1.5}
              />
              <Rect
                x={cx + 1}
                y={Math.min(y(m.expense), y(0))}
                width={bar}
                height={Math.max(0.8, Math.abs(y(0) - y(m.expense)))}
                fill={C.ochreLight}
                rx={1.5}
                ry={1.5}
              />
            </G>
          );
        })}
        {months.length > 1 && <Polyline points={points} stroke={C.primary} strokeWidth={1.6} fill="none" />}
        {months.map((m, i) => (
          <Circle
            key={m.label}
            cx={slot * i + slot / 2}
            cy={y(m.balance)}
            r={2.2}
            fill={C.white}
            stroke={C.primary}
            strokeWidth={1.2}
          />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 4 }}>
        {months.map((m) => (
          <Text key={m.label} style={{ width: slot, fontSize: 6.5, color: C.muted, textAlign: "center" }}>
            {m.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** A thin horizontal progress bar. */
export function Bar({ value, color, track = C.lineSoft }: { value: number; color: string; track?: string }) {
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: track, flexDirection: "row", overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

/** Shares side by side in one bar (payment methods, statuses). */
export function StackedBar({ parts, height = 7 }: { parts: { value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <View style={{ height, borderRadius: 4, backgroundColor: C.lineSoft, flexDirection: "row", overflow: "hidden" }}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p, i) => <View key={i} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />)}
    </View>
  );
}

/** Concentric rings in the night band's corner — decoration only. */
export function Rings({ size }: { size: number }) {
  const c = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.2, 0.34, 0.48].map((f) => (
        <Circle key={f} cx={c} cy={c} r={size * f} stroke={C.nightLine} strokeWidth={0.8} fill="none" />
      ))}
    </Svg>
  );
}
