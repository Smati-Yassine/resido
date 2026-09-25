"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { usePopover } from "@/components/ui/usePopover";

interface ResidenceItem {
  id: string;
  name: string;
  city: string;
  slug: string;
}

/** The residence being worked on, in the top bar; opens the user's other residences. */
export function ResidenceSwitcher({
  current,
  lotCount,
  residences,
}: {
  current: ResidenceItem;
  lotCount: number;
  residences: ResidenceItem[];
}) {
  const { t } = useI18n();
  const { open, toggle, close, ref } = usePopover();
  const subtitle = [current.city, `${lotCount} ${t.lotsWord}`].filter(Boolean).join(" · ");

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        className="user-trigger max-w-full pl-2"
        aria-label={t.switchResidence}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tile-icon h-[30px] w-[30px] rounded-lg">
          <Icon name="residence" size={17} />
        </span>
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="max-w-[240px] truncate text-[15px] font-bold text-ink">{current.name}</span>
          <span className="text-xs text-muted">{subtitle}</span>
        </span>
        <Icon name="chevronDown" size={16} strokeWidth={2} />
      </button>
      {open && (
        <div role="menu" className="popover absolute left-0 top-[52px] flex w-[320px] flex-col gap-0.5">
          <span className="label-caps px-3 pb-1.5 pt-2 text-[11px]">{t.yourResidences}</span>
          {residences.map((r) => (
            <Link
              key={r.id}
              role="menuitem"
              href={`/residences/${r.slug}`}
              className="menu-item py-2.5"
              aria-current={r.id === current.id}
              onClick={close}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{r.name}</span>
                {r.city && <span className="text-xs text-muted">{r.city}</span>}
              </span>
              {r.id === current.id && (
                <span className="text-primary">
                  <Icon name="check" size={16} strokeWidth={2.4} />
                </span>
              )}
            </Link>
          ))}
          <div className="divider mx-1 my-1.5" />
          <Link href="/residences" className="menu-item h-10 py-0 text-sm font-bold text-primary" onClick={close}>
            {t.allResidences} →
          </Link>
        </div>
      )}
    </div>
  );
}
