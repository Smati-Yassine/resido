import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount, formatMonthShort } from "@/lib/format";
import type { CurvePoint } from "@/lib/domain/overview/finance";

/**
 * Dashboard charts, drawn as plain SVG on the server. Colours come from the
 * design system's classes (globals.css), so they follow the theme.
 */

/** A 3/4 ring filling up to `value` percent, with the figure in its middle — on the dark hero card. */
export function Gauge({ value }: { value: number }) {
  // Circumference 100 (r = 15.915) so dash lengths read as percents; 75 of it is drawn.
  const shown = (Math.max(0, Math.min(100, value)) / 100) * 75;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 42 42" className="h-full w-full rotate-[135deg]" aria-hidden="true">
        <circle className="gauge-track" cx="21" cy="21" r="15.915" strokeWidth="3.4" strokeDasharray="75 25" />
        {shown > 0 && (
          <circle
            className="gauge-fill"
            cx="21"
            cy="21"
            r="15.915"
            strokeWidth="3.4"
            strokeDasharray={`${shown} ${100 - shown}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[36px] leading-none">{value}%</span>
      </div>
    </div>
  );
}

/** A ring split into segments (paid / partial / unpaid), with a total in its middle. */
export function Donut({
  segments,
  total,
  caption,
}: {
  segments: { className: string; value: number }[];
  total: number;
  caption: string;
}) {
  // Each segment starts where the previous ones end, from 12 o'clock.
  const shares = segments.map((s) => (total ? (s.value / total) * 100 : 0));
  const starts = shares.map((_, i) => shares.slice(0, i).reduce((n, v) => n + v, 0));
  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg viewBox="0 0 42 42" className="h-full w-full" aria-hidden="true">
        <circle className="donut-track" cx="21" cy="21" r="15.915" strokeWidth="5" />
        {segments.map((s, i) =>
          shares[i] > 0 ? (
            <circle
              key={s.className}
              className={`donut-seg ${s.className}`}
              cx="21"
              cy="21"
              r="15.915"
              strokeWidth="5"
              strokeDasharray={`${shares[i]} ${100 - shares[i]}`}
              strokeDashoffset={25 - starts[i]}
            />
          ) : null,
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[30px] font-bold leading-none">{total}</span>
        <span className="mt-1 text-xs text-muted">{caption}</span>
      </div>
    </div>
  );
}

/**
 * Change against the previous cycle. `goodWhenUp` says which way is good
 * news (what is still owed going up is not).
 */
export function Delta({
  value,
  unit = "%",
  label,
  goodWhenUp = true,
  onNight = false,
}: {
  value: number | null;
  unit?: string;
  label: string;
  goodWhenUp?: boolean;
  onNight?: boolean;
}) {
  if (value === null) return null;
  const tone = onNight
    ? "delta-on-night"
    : value === 0
      ? "delta-flat"
      : value > 0 === goodWhenUp
        ? "delta-good"
        : "delta-bad";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "•";
  return (
    <span className={`delta ${tone}`} title={label}>
      {arrow} {value > 0 ? "+" : ""}
      {value}
      {unit}
      {label && <span className="font-medium opacity-80">{label}</span>}
    </span>
  );
}

/**
 * The running total collected across the cycle as a step line over time,
 * against a dashed line at what was billed; "today" is marked while the
 * cycle is still running.
 */
export function CollectionCurve({
  points,
  expectedMillimes,
  start,
  end,
  today,
  t,
  locale,
  currency,
}: {
  points: CurvePoint[];
  expectedMillimes: number;
  start: Date;
  end: Date;
  today: Date | null;
  t: Dictionary;
  locale: Locale;
  currency: CurrencyCode;
}) {
  const t0 = start.getTime();
  const span = Math.max(1, end.getTime() - t0);
  const top = Math.max(1, expectedMillimes, ...points.map((p) => p.cumulativeMillimes));
  const x = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - t0) / span) * 100));
  const y = (v: number) => 96 - (v / top) * 88;

  // Steps: the total holds until the next payment day, then jumps.
  const coords: string[] = [];
  points.forEach((p, i) => {
    if (i > 0) coords.push(`${x(p.date)},${y(points[i - 1].cumulativeMillimes)}`);
    coords.push(`${x(p.date)},${y(p.cumulativeMillimes)}`);
  });
  const line = coords.join(" ");
  const lastX = x(points[points.length - 1].date);

  // Four month labels spread along the axis.
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => {
    const d = new Date(t0 + f * span);
    return formatMonthShort(d.toISOString().slice(0, 7), locale);
  });
  const targetY = y(expectedMillimes);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[220px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          <polygon className="chart-area-pos" points={`0,100 ${line} ${lastX},100`} />
          <line className="chart-target" x1="0" x2="100" y1={targetY} y2={targetY} />
          {today && <line className="chart-today" x1={x(today)} x2={x(today)} y1="0" y2="100" />}
          <polyline className="chart-line-pos" points={line} />
        </svg>
        <span
          className="num absolute right-0 -translate-y-full pb-1 text-xs font-semibold text-neg"
          style={{ top: `${targetY}%` }}
        >
          {t.curveTarget} · {formatAmount(expectedMillimes, currency)}
        </span>
        {today && (
          <span
            className="absolute bottom-0 -translate-x-1/2 rounded bg-surface px-1 text-[11px] text-muted"
            style={{ left: `${x(today)}%` }}
          >
            {t.today}
          </span>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted">
        {ticks.map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

/** A small full ring filling up to `value` percent, the figure in its middle — on light cards. */
export function Ring({ value, size = 76 }: { value: number | null; size?: number }) {
  const shown = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle className="ring-track" cx="21" cy="21" r="15.915" strokeWidth="4" />
        {shown > 0 && (
          <circle
            className="ring-fill"
            cx="21"
            cy="21"
            r="15.915"
            strokeWidth="4"
            strokeDasharray={`${shown} ${100 - shown}`}
          />
        )}
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[15px] font-bold">
        {value === null ? "—" : `${value}%`}
      </span>
    </div>
  );
}
