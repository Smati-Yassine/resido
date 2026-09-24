"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { SideNav } from "./WorkspaceNav";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The frame of every page inside a residence: the signed-in top bar (brand,
 * then the residence and cycle switchers, then the user menu) over a
 * collapsible sidebar. The brand block and the sidebar share one width, so
 * they line up open or collapsed. The choice is kept in a cookie the server
 * reads, so a reload renders it as left.
 */
export function ResidenceShell({
  residenceId,
  initialCollapsed,
  lotCount,
  unpaidCount,
  switchers,
  userMenu,
  children,
}: {
  residenceId: string;
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
    <div className="shell" data-collapsed={collapsed}>
      <header className="shell-header">
        <Link href="/residences" className="shell-brand" aria-label={t.allResidences}>
          <span className="brand-mark shrink-0">R</span>
          <span className="shell-brand-name font-display text-[22px] font-semibold">Résido</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-6">{switchers}</div>
        <div className="pr-6">{userMenu}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="side">
          <SideNav
            residenceId={residenceId}
            lotCount={lotCount}
            unpaidCount={unpaidCount}
            footer={
              <button
                type="button"
                className="side-item text-muted"
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
        <main className="scroll flex min-w-0 flex-1 flex-col gap-6 px-10 pb-12 pt-8">{children}</main>
      </div>
    </div>
  );
}
