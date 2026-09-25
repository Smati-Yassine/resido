import Link from "next/link";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { describeAuditEntry } from "@/lib/audit/describe";
import { listAuditLog } from "@/lib/audit/log";
import * as members from "@/lib/domain/members/service";
import { findUsersByIds } from "@/lib/domain/users/service";
import { EmptyState, PageHeader } from "@/components/ui/Display";
import { GeneralSettings } from "@/components/workspace/Settings";
import { MembersPanel } from "@/components/workspace/Members";
import { CyclesPanel } from "@/components/settings/CyclesPanel";

const TABS = ["general", "cycles", "members", "journal"] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ params, searchParams }: PageProps<"/residences/[residenceId]/settings">) {
  const {
    session,
    residenceId,
    residence,
    cycle: viewed,
    cycles,
    currency,
    can, base } = await loadWorkspace(params, searchParams);
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "general";
  const { t, locale } = await getDictionary();

  const tabLabel: Record<Tab, string> = {
    general: t.tabGeneral,
    cycles: t.cycles,
    members: t.members,
    journal: t.journal,
  };
  const cycleQuery = viewed ? `&cycle=${viewed.id}` : "";

  return (
    <>
      <PageHeader title={t.settings} />
      <nav className="tabs" aria-label={t.settings}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={`${base}/settings?tab=${key}${cycleQuery}`}
            className="tab"
            aria-current={key === tab ? "page" : undefined}
          >
            {tabLabel[key]}
          </Link>
        ))}
      </nav>

      {tab === "general" && (
        <GeneralSettings
          residence={{ id: residence.id, name: residence.name, city: residence.city, currency: residence.currency }}
          canManage={can("*")}
        />
      )}

      {tab === "cycles" && (
        <CyclesPanel
          t={t}
          session={session}
          residenceId={residenceId}
          cycles={cycles}
          currency={currency}
          base={base}
          canManageCycles={can("cycles:manage")}
        />
      )}

      {tab === "members" && <MembersTab />}

      {tab === "journal" && <JournalTab />}
    </>
  );

  async function MembersTab() {
    const result = await members.listMembers(session, residenceId);
    if (!result.ok) return null;
    return (
      <MembersPanel
        residenceId={residenceId}
        residenceName={residence.name}
        currentUserId={session.userId}
        canManage={can("*")}
        members={result.data.members.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          since: formatDate(m.since),
        }))}
        invitations={result.data.invitations.map((i) => ({ id: i.id, email: i.email, role: i.role }))}
      />
    );
  }

  async function JournalTab() {
    const entries = await listAuditLog(residenceId);
    const people = new Map(
      (await findUsersByIds([...new Set(entries.map((e) => e.actorUserId))])).map((u) => [u.id, u.name]),
    );
    if (entries.length === 0) return <EmptyState text={t.journalEmpty} />;
    return (
      <>
        <p className="text-sm text-muted">{t.journalHelp}</p>
        <div className="card data-table">
          <div className="data-head grid-cols-[160px_180px_220px_1fr]">
            <span>{t.colWhen}</span>
            <span>{t.colWho}</span>
            <span>{t.colWhat}</span>
            <span>{t.colDetail}</span>
          </div>
          {entries.map((entry) => (
            <div key={entry.id} className="data-row grid-cols-[160px_180px_220px_1fr]">
              <span className="num text-[13px] text-muted">{formatDateTime(entry.createdAt, locale)}</span>
              <span className="truncate font-semibold">{people.get(entry.actorUserId) ?? t.someone}</span>
              <span>{t[`audit${entry.action}`]}</span>
              <span className="truncate text-[13px] text-muted">{describeAuditEntry(entry, t, currency)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
}
