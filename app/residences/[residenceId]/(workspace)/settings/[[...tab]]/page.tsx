import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspace, tabFromPath } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { CURRENCIES } from "@/lib/currency";
import { loadResidenceSettings, SETTINGS_TABS, type SettingsTab } from "@/lib/settings/residence-settings";
import { PageHeader, StatCell } from "@/components/ui/Display";
import { NewCycleButton } from "@/components/workspace/CycleControls";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";

/**
 * Residence settings, laid out like Finances and Copropriété: the header, a
 * strip of figures, then one tab per part — /settings (general),
 * /settings/cycles, /settings/members, /settings/journal. Each is also its
 * own entry in the sidebar's Settings group. The same sections open as a
 * modal from the residences list.
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
  const hrefs = Object.fromEntries(SETTINGS_TABS.map((key) => [key, tabHref(key)])) as Record<SettingsTab, string>;
  const open = data.cycles.find((c) => c.status === "OPEN");
  const entries = data.journal.flatMap((d) => d.entries);
  const latest = data.journal[0];
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
    journal: entries.length,
  };

  return (
    <>
      <PageHeader
        subtitle={interpolate(t.settingsSubtitle, { name: residence.name, city: residence.city || "—" })}
        title={t.settings}
        actions={tab === "cycles" && data.can.cycles && <NewCycleButton residenceId={residence.id} />}
      />

      <section className="card ledger" aria-label={t.residenceSettings}>
        <StatCell
          label={t.cycles}
          value={String(data.cycles.length)}
          note={open ? interpolate(t.statOpenCycle, { name: open.name }) : t.statNoOpenCycle}
        />
        <StatCell
          label={t.members}
          value={String(data.members.length)}
          note={
            data.invitations.length ? interpolate(t.statInvites, { count: data.invitations.length }) : t.statNoInvites
          }
        />
        <StatCell
          label={t.currency}
          value={`${residence.currency} · ${CURRENCIES[residence.currency].symbol}`}
          note={CURRENCIES[residence.currency].name[locale]}
        />
        <StatCell
          label={t.lastActivity}
          value={latest ? latest.day : "—"}
          note={
            latest
              ? interpolate(t.lastActivityNote, { who: latest.entries[0].who, when: latest.entries[0].what })
              : t.noActivityYet
          }
        />
      </section>

      <nav className="tabs" aria-label={t.settings}>
        {SETTINGS_TABS.map((key) => (
          <Link key={key} href={hrefs[key]} className="tab" aria-current={key === tab ? "page" : undefined}>
            {labels[key]}
            {counts[key] !== null && <span className="tab-count">{counts[key]}</span>}
          </Link>
        ))}
      </nav>

      <ResidenceSettingsView data={data} tab={tab} hrefs={hrefs} mode="page" />
    </>
  );
}
