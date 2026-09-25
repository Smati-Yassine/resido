import { notFound } from "next/navigation";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { loadResidenceSettings, SETTINGS_TABS, type SettingsTab } from "@/lib/settings/residence-settings";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";

/** Residence settings: General, Cycles, Members, Journal (`?tab=`). The same view opens as a modal from the residences list. */
export default async function SettingsPage({ params, searchParams }: PageProps<"/residences/[residenceId]/settings">) {
  const { session, residenceId, cycle: viewed, base } = await loadWorkspace(params, searchParams);
  const { tab: tabParam } = await searchParams;
  const tab: SettingsTab = SETTINGS_TABS.includes(tabParam as SettingsTab) ? (tabParam as SettingsTab) : "general";
  const { t, locale } = await getDictionary();
  const data = await loadResidenceSettings(session, residenceId, t, locale);
  if (!data) notFound();

  const cycleQuery = viewed ? `&cycle=${viewed.id}` : "";
  const hrefs = Object.fromEntries(
    SETTINGS_TABS.map((key) => [key, `${base}/settings?tab=${key}${cycleQuery}`]),
  ) as Record<SettingsTab, string>;

  return <ResidenceSettingsView data={data} tab={tab} hrefs={hrefs} mode="page" />;
}
