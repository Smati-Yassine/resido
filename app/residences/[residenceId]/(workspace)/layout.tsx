import { cookies } from "next/headers";
import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { listMembershipsForUser } from "@/lib/domain/memberships/repository";
import { findResidencesByIds } from "@/lib/domain/residences/repository";
import { toCycleView } from "@/lib/cycle-view";
import { defaultCycle, loadResidence, lotRowsFor, activeLotsFor } from "@/lib/workspace";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { CurrencyProvider } from "@/components/ui/CurrencyProvider";
import { ResidenceShell } from "@/components/shell/ResidenceShell";
import { ResidenceSwitcher } from "@/components/shell/ResidenceSwitcher";
import { CycleSwitcher } from "@/components/shell/CycleSwitcher";
import { UserMenu } from "@/components/shell/UserMenu";
import { ViewedCycleProvider } from "@/components/shell/ViewedCycle";

/** Inside a residence: the signed-in top bar with residence + cycle switchers, over a collapsible sidebar. */
export default async function ResidenceLayout({ children, params }: LayoutProps<"/residences/[residenceId]">) {
  const { residenceId: key } = await params;
  const { user, session, residence, residenceId, base, cycles } = await loadResidence(key);
  const { t } = await getDictionary();
  const { theme } = await getPreferences();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;

  const current = defaultCycle(cycles);
  const [myResidences, lotList, rows] = await Promise.all([
    findResidencesByIds((await listMembershipsForUser(user.userId)).map((m) => m.residenceId)),
    activeLotsFor(session, residenceId),
    current && current.status !== "DRAFT" ? lotRowsFor(session, residenceId, current.id) : Promise.resolve([]),
  ]);
  const residenceItems = myResidences
    .filter((r) => r.status === "ACTIVE" || r.id === residenceId)
    .map((r) => ({ id: r.id, name: r.name, city: r.city, slug: r.slug }));
  const lotCount = lotList.ok ? lotList.data.length : 0;

  return (
    <ViewedCycleProvider
      cycles={cycles.map((c) => ({ id: c.id, slug: c.slug, name: c.name, status: c.status }))}
      defaultCycleId={current?.id ?? null}
    >
      <ResidenceShell
        base={base}
        initialCollapsed={collapsed}
        lotCount={lotCount}
        // Lots still owing something in the current cycle — the Encaissements badge.
        unpaidCount={rows.filter((r) => r.status !== "PAID").length}
        cycleCount={cycles.length}
        switchers={
          <>
            <ResidenceSwitcher
              current={{
                id: residence.id,
                name: residence.name,
                city: residence.city,
                slug: residence.slug,
              }}
              lotCount={lotCount}
              residences={residenceItems}
            />
            <span className="header-divider" aria-hidden="true" />
            <CycleSwitcher cycles={cycles.map((c) => toCycleView(c, t))} defaultCycleId={current?.id ?? null} />
          </>
        }
        userMenu={
          <UserMenu
            user={{ name: user.name, email: user.email }}
            theme={theme}
            residences={myResidences.map((r) => ({ id: r.id, name: r.name }))}
          />
        }
      >
        <CurrencyProvider code={residence.currency}>{children}</CurrencyProvider>
      </ResidenceShell>
    </ViewedCycleProvider>
  );
}
