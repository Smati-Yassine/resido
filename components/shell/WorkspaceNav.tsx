"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { useResidenceBase } from "./ResidenceLink";

type SectionKey = "dashboard" | "finances" | "property" | "settings";

interface Section {
  key: SectionKey;
  path: string;
  icon: IconName;
}

const S = (key: SectionKey, path: string, icon: IconName): Section => ({ key, path, icon });

/** The residence's sections, in their sidebar groups; settings sits apart at the bottom. */
const GROUPS: { label: keyof Dictionary; sections: Section[] }[] = [
  {
    label: "navOverview",
    sections: [
      S("dashboard", "", "dashboard"),
      S("finances", "/finances", "treasury"),
      S("property", "/property", "lots"),
    ],
  },
];
const SETTINGS = S("settings", "/settings", "settings");

export const SECTIONS: Section[] = [...GROUPS.flatMap((g) => g.sections), SETTINGS];

/** Which section a pathname belongs to. */
export function useSection() {
  const pathname = usePathname();
  const rest = pathname.slice(useResidenceBase().length);
  return SECTIONS.find((s) => s.path && rest.startsWith(s.path)) ?? SECTIONS[0];
}

/** A workspace link that keeps the cycle being viewed. */
export function useWorkspaceHref() {
  const base = useResidenceBase();
  const params = useSearchParams();
  const cycle = params.get("cycle");
  return (path: string, cycleSlug: string | null = cycle) => `${base}${path}${cycleSlug ? `?cycle=${cycleSlug}` : ""}`;
}

/**
 * The sidebar's content. Collapsed, the CSS hides labels, texts and counts
 * (`.shell[data-collapsed]`); every item keeps its name as title and
 * aria-label, so the icon-only strip stays readable and accessible.
 */
export function SideNav({
  lotCount,
  unpaidCount,
  footer,
}: {
  lotCount: number;
  unpaidCount: number;
  footer: React.ReactNode;
}) {
  const { t } = useI18n();
  const current = useSection();
  const href = useWorkspaceHref();

  const item = (s: Section, extra?: React.ReactNode) => {
    const label = t[s.key] as string;
    return (
      <Link
        key={s.key}
        href={href(s.path)}
        className="side-item"
        title={label}
        aria-label={label}
        aria-current={s === current ? "page" : undefined}
      >
        <Icon name={s.icon} size={19} />
        <span className="side-text">{label}</span>
        {extra}
      </Link>
    );
  };

  return (
    <>
      <nav className="flex flex-1 flex-col gap-0.5" aria-label={t.residenceSections}>
        {GROUPS.map((group, i) => (
          <div key={group.label} className="side-group flex flex-col gap-0.5">
            <span className="side-label">{t[group.label] as string}</span>
            {i > 0 && <span className="side-divider" aria-hidden="true" />}
            {group.sections.map((s) =>
              item(
                s,
                s.key === "property" ? (
                  <span className="side-count">{lotCount}</span>
                ) : s.key === "finances" && unpaidCount > 0 ? (
                  <span
                    className="side-count side-count-warn"
                    title={interpolate(t.unpaidLots, { count: unpaidCount })}
                  >
                    {unpaidCount}
                  </span>
                ) : undefined,
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        {item(SETTINGS)}
        {footer}
      </div>
    </>
  );
}
