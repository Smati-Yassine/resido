import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspace, tabFromPath } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { loadResidenceSettings, SETTINGS_TABS, type SettingsTab } from "@/lib/settings/residence-settings";
import { PageHeader } from "@/components/ui/Display";
import { NewCycleButton } from "@/components/workspace/CycleControls";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";

/**
 * Residence settings, laid out like Finances: the header, then one tab per
 * part — /settings (general), /settings/cycles, /settings/members,
 * /settings/journal. The same sections open as a modal from the residences list.
 */
export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/residences/[residenceId]/settings/[[...tab]]">) {
  const { session, residenceId, href } = await loadWorkspace(params, searchParams);
  const tabHref = (key: SettingsTab) => href(key === "general" ? "/settings" : `/settings/${key}`);
  const tab = tabFromPath((await params).tab, SETTINGS_TABS, (await searchParams).tab, tabHref);
  const { t, locale } = await getDictionary();
  const data = await loadResidenceSettings(session, residenceId, t, locale);
  if (!data) notFound();

  const { residence } = data;
  const labels: Record<SettingsTab, string> = {
    general: t.tabGeneral,
    cycles: t.cycles,
    members: t.members,
    journal: t.journal,
  };
  const counts: Record<SettingsTab, number | null> = {
    general: null,
    cycles: data.cycles.length,
    members: data.members.length,
    journal: data.journal.reduce((n, d) => n + d.entries.length, 0),
  };

  return (
    <>
      <PageHeader
        subtitle={[residence.name, residence.city].filter(Boolean).join(" · ")}
        title={t.settings}
        actions={tab === "cycles" && data.can.cycles && <NewCycleButton residenceId={residence.id} />}
      />
      <nav className="tabs" aria-label={t.settings}>
        {SETTINGS_TABS.map((key) => (
          <Link key={key} href={tabHref(key)} className="tab" aria-current={key === tab ? "page" : undefined}>
            {labels[key]}
            {counts[key] !== null && <span className="tab-count">{counts[key]}</span>}
          </Link>
        ))}
      </nav>
      <ResidenceSettingsView data={data} tab={tab} mode="page" />
    </>
  );
}
