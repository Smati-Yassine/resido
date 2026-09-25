import { Icon, type IconName } from "./Icon";

/** Page title block: small subtitle line above a display heading, actions on the right. */
export function PageHeader({
  subtitle,
  title,
  actions,
}: {
  subtitle?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {subtitle && <span className="subtle">{subtitle}</span>}
        <h1 className="h-page">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export type BadgeTone = "paid" | "partial" | "unpaid" | "open" | "closed" | "draft";

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  text,
  children,
}: {
  title?: React.ReactNode;
  text: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-dashed flex flex-col items-center gap-3 p-12">
      {title && <span className="font-display text-2xl text-ink">{title}</span>}
      <span className="max-w-xl text-[15px]">{text}</span>
      {children}
    </div>
  );
}

export function Notice({
  icon,
  tone = "info",
  children,
}: {
  icon: IconName;
  tone?: "info" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div className={`note note-${tone}`}>
      <span className="shrink-0 text-primary">
        <Icon name={icon} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Kpi({
  label,
  value,
  foot,
  valueClassName = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  foot?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${valueClassName}`}>{value}</span>
      {foot && <span className="kpi-foot">{foot}</span>}
    </div>
  );
}

/** Horizontal progress bar; `value` is a percentage. */
export function Bar({ value, tone = "primary" }: { value: number; tone?: "primary" | "pos" | "muted" }) {
  const toneClass = tone === "pos" ? "bar-fill-pos" : tone === "muted" ? "bar-fill-muted" : "";
  return (
    <div className="bar">
      <div className={`bar-fill ${toneClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** One figure of a stat strip (`card ledger`): label, value, optional note. */
export function StatCell({
  label,
  value,
  note,
  valueClass = "",
}: {
  label: string;
  value: string;
  note?: string;
  valueClass?: string;
}) {
  return (
    <div className="ledger-cell">
      <span className="ledger-label">{label}</span>
      <span className={`ledger-value ${valueClass}`}>{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
