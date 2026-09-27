"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { SideNav, TabBar } from "./WorkspaceNav";
import { ResidenceBaseProvider } from "./ResidenceLink";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The frame of every page inside a residence: the signed-in top bar (brand,
 * then the residence and cycle switchers, then the user menu) over a
 * collapsible sidebar. The brand block and the sidebar share one width, so
 * they line up open or collapsed. The choice is kept in a cookie the server
 * reads, so a reload renders it as left. A tablet always gets the icon strip;
 * a phone gets a tab bar at the bottom instead (see `.shell` in globals.css).
 */
export function ResidenceShell({
  base,
  initialCollapsed,
  lotCount,
  unpaidCount,
  switchers,
  userMenu,
  children,
}: {
  /** `/residences/<slug>` — every link inside the residence starts with it. */
  base: string;
  initialCollapsed: boolean;
  lotCount: number;
  unpaidCount: number;
  switchers: React.ReactNode;
  userMenu: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_COLLAPSED : "open"}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  };
  const toggleLabel = collapsed ? t.expandMenu : t.collapseMenu;

  return (
    <ResidenceBaseProvider base={base}>
      <div className="shell" data-collapsed={collapsed}>
        <header className="shell-header">
          <Link href="/residences" className="shell-brand" aria-label={t.allResidences}>
            <span className="brand-mark shrink-0">R</span>
            <span className="shell-brand-name font-display text-[22px] font-semibold">Résido</span>
          </Link>
          <div className="shell-context">{switchers}</div>
          <div className="shell-account">{userMenu}</div>
        </header>

        <div className="shell-body">
          <aside className="side">
            <SideNav
              lotCount={lotCount}
              unpaidCount={unpaidCount}
              footer={
                <button
                  type="button"
                  className="side-item side-toggle text-muted"
                  title={toggleLabel}
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  onClick={toggle}
                >
                  <Icon name={collapsed ? "panelExpand" : "panelCollapse"} size={19} />
                  <span className="side-text">{t.collapseMenu}</span>
                </button>
              }
            />
          </aside>
          <main className="scroll shell-main flex-col">{children}</main>
        </div>
        <TabBar unpaidCount={unpaidCount} />
      </div>
    </ResidenceBaseProvider>
  );
}
