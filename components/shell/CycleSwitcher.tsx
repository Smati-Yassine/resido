"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Display";
import { useI18n } from "@/components/ui/I18nProvider";
import { usePopover } from "@/components/ui/usePopover";
import type { CycleView } from "@/lib/cycle-view";
import { isSettings, useSection, useWorkspaceHref } from "./WorkspaceNav";
import { useResidenceBase } from "./ResidenceLink";

/** The cycle being viewed, in the top bar; switching keeps the current section. */
export function CycleSwitcher({ cycles, defaultCycleId }: { cycles: CycleView[]; defaultCycleId: string | null }) {
  const { t } = useI18n();
  const { open, toggle, close, ref } = usePopover();
  const params = useSearchParams();
  const pathname = usePathname();
  const base = useResidenceBase();
  const section = useSection();
  const href = useWorkspaceHref();
  const param = params.get("cycle");
  const selected =
    cycles.find((c) => c.slug === param || c.id === param) ?? cycles.find((c) => c.id === defaultCycleId);

  const manage = (
    <Link
      href={`${base}/settings/cycles`}
      className="menu-item h-10 py-0 text-sm font-bold text-primary"
      onClick={close}
    >
      {t.manageCycles}
    </Link>
  );

  // No cycle yet: the button leads straight to Settings › Cycles.
  if (!selected) {
    return (
      <Link href={`${base}/settings/cycles`} className="btn btn-ghost btn-sm gap-2.5 bg-surface">
        <Icon name="calendar" size={16} />
        {t.noCycle}
      </Link>
    );
  }
  // From settings, picking a cycle goes to its dashboard; elsewhere it stays on the same page
  // (the same tab too: /finances/expenses stays /finances/expenses).
  const targetPath = isSettings(section) ? "" : pathname.slice(base.length);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost h-10 gap-2.5 bg-surface pl-3.5 pr-3"
        aria-label={t.changeCycle}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="text-muted">
          <Icon name="calendar" size={16} />
        </span>
        <span>{selected.name}</span>
        <Badge tone={selected.badge}>{selected.statusLabel}</Badge>
        <span className="text-muted">
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div role="menu" className="popover absolute left-0 top-12 flex w-[340px] flex-col gap-0.5">
          {cycles.map((c) => (
            <Link
              key={c.id}
              role="menuitem"
              // The current cycle needs no ?cycle= at all.
              href={href(targetPath, c.id === defaultCycleId ? null : c.slug)}
              className="menu-item py-2.5"
              aria-current={c.id === selected.id}
              onClick={close}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold">{c.name}</span>
                <span className="text-xs text-muted">{c.range}</span>
              </span>
              <Badge tone={c.badge}>{c.statusLabel}</Badge>
            </Link>
          ))}
          <div className="divider mx-1 my-1.5" />
          {manage}
        </div>
      )}
    </div>
  );
}
