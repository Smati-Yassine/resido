import { notFound } from "next/navigation";
import { loadWorkspace, tabFromPath } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { loadResidenceSettings, SETTINGS_TABS, type SettingsTab } from "@/lib/settings/residence-settings";
import { PageHeader } from "@/components/ui/Display";
import { NewCycleButton } from "@/components/workspace/CycleControls";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";

/**
 * Residence settings, one part per page — /settings (general),
 * /settings/cycles, /settings/members, /settings/journal — each an entry of
 * the sidebar's Settings group. The same sections open as a modal from the
 * residences list.
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

  const titles: Record<SettingsTab, string> = {
    general: t.tabGeneral,
    cycles: t.cycles,
    members: t.members,
    journal: t.journal,
  };
  return (
    <div className="settings-page">
      <PageHeader
        subtitle={t.settings}
        title={titles[tab]}
        actions={tab === "cycles" && data.can.cycles && <NewCycleButton residenceId={data.residence.id} />}
      />
      <ResidenceSettingsView data={data} tab={tab} mode="page" />
    </div>
  );
}
