/**
 * The building blocks of every settings screen (residence and account): a
 * tab bar, cards of labelled rows. Rows stack, title above control, when their
 * card is narrow (see `.settings-group` in globals.css).
 */

export function SettingsTabs<K extends string>({
  items,
  value,
  onChange,
  label,
  action,
}: {
  items: { key: K; label: string; count?: number | null }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /** A button at the end of the bar (e.g. New cycle). */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[54px] items-end justify-between gap-4 border-b border-line">
      <nav className="tabs min-w-0 overflow-x-auto border-b-0" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className="tab shrink-0"
            aria-current={item.key === value ? "page" : undefined}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count != null && <span className="tab-count">{item.count}</span>}
          </button>
        ))}
      </nav>
      {action && <div className="shrink-0 pb-2.5">{action}</div>}
    </div>
  );
}

export function Group({
  title,
  text,
  action,
  danger = false,
  children,
}: {
  /** None when the screen already says it: the card is just its rows. */
  title?: string;
  text?: string;
  action?: React.ReactNode;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={`card settings-group ${danger ? "settings-group-danger" : ""}`}>
      {title && (
        <div className="settings-group-head">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="h-card">{title}</h2>
            {text && <p className="text-[13px] text-muted">{text}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <span className="settings-row-title">{title}</span>
        {text && <span className="settings-row-text">{text}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
