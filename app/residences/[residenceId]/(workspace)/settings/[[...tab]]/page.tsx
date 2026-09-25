import { notFound } from "next/navigation";
import { loadWorkspace, tabFromPath } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { loadResidenceSettings, SETTINGS_TABS, type SettingsTab } from "@/lib/settings/residence-settings";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";

/**
 * Residence settings: /settings (general), /settings/cycles, /settings/members,
 * /settings/journal. The same view opens as a modal from the residences list.
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

  const hrefs = Object.fromEntries(SETTINGS_TABS.map((key) => [key, tabHref(key)])) as Record<SettingsTab, string>;
  return <ResidenceSettingsView data={data} tab={tab} hrefs={hrefs} mode="page" />;
}
