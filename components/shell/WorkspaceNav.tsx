"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { useResidenceBase } from "./ResidenceLink";

type SectionKey = "dashboard" | "finances" | "property" | "general" | "cycles" | "members" | "journal";

interface Section {
  key: SectionKey;
  path: string;
  icon: IconName;
  label: keyof Dictionary;
}

const S = (key: SectionKey, path: string, icon: IconName, label: keyof Dictionary = key as keyof Dictionary) => ({
  key,
  path,
  icon,
  label,
});

/** The residence's sections, in their sidebar groups: the overview, then each part of the settings. */
const GROUPS: { label: keyof Dictionary; sections: Section[] }[] = [
  {
    label: "navOverview",
    sections: [
      S("dashboard", "", "dashboard"),
      S("finances", "/finances", "treasury"),
      S("property", "/property", "lots"),
    ],
  },
  {
    label: "settings",
    sections: [
      S("general", "/settings", "settings", "tabGeneral"),
      S("cycles", "/settings/cycles", "calendar"),
      S("members", "/settings/members", "user"),
      S("journal", "/settings/journal", "history"),
    ],
  },
];

export const SECTIONS: Section[] = GROUPS.flatMap((g) => g.sections);

/** Which section a pathname belongs to: the longest path it falls under (/settings/cycles is Cycles, not General). */
export function useSection() {
  const pathname = usePathname();
  const rest = pathname.slice(useResidenceBase().length);
  const matches = SECTIONS.filter((s) => s.path && (rest === s.path || rest.startsWith(`${s.path}/`)));
  return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? SECTIONS[0];
}

/** Whether a section is one of the settings pages. */
export const isSettings = (section: Section) => section.path.startsWith("/settings");

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
  cycleCount,
  footer,
}: {
  lotCount: number;
  unpaidCount: number;
  cycleCount: number;
  footer: React.ReactNode;
}) {
  const { t } = useI18n();
  const current = useSection();
  const href = useWorkspaceHref();

  const item = (s: Section, extra?: React.ReactNode) => {
    const label = t[s.label] as string;
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
                ) : s.key === "cycles" ? (
                  <span className="side-count">{cycleCount}</span>
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
      <div className="side-foot">{footer}</div>
    </>
  );
}
