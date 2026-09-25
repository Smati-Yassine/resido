import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { roleHasPermission } from "@/lib/rbac/permissions";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { CurrencyCode } from "@/lib/currency";
import type { BadgeTone } from "@/components/ui/Display";
import type { IconName } from "@/components/ui/Icon";
import { formatDate, formatDateTime } from "@/lib/format";
import { toCycleView } from "@/lib/cycle-view";
import { residencePath, withSlugs } from "@/lib/workspace";
import { findResidenceById } from "@/lib/domain/residences/repository";
import * as cycles from "@/lib/domain/cycles/service";
import * as members from "@/lib/domain/members/service";
import * as lots from "@/lib/domain/lots/service";
import { summarizeAssessmentsForCycle } from "@/lib/domain/assessments/repository";
import { findUsersByIds } from "@/lib/domain/users/service";
import { listAuditLog } from "@/lib/audit/log";
import { describeAuditEntry } from "@/lib/audit/describe";

export const SETTINGS_TABS = ["general", "cycles", "members", "journal"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export interface SettingsCycle {
  id: string;
  /** The cycle's name in URLs. */
  slug: string;
  name: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  statusLabel: string;
  badge: BadgeTone;
  range: string;
  /** Null for a draft: it bills nothing yet. */
  expectedMillimes: number | null;
  collectedMillimes: number | null;
  closingBalanceMillimes: number | null;
}

/** What a journal entry is about — the Journal tab's filters. */
export type JournalKind = "money" | "cycles" | "property" | "access";

export interface SettingsJournalEntry {
  id: string;
  time: string;
  who: string;
  what: string;
  detail: string;
  kind: JournalKind;
  icon: IconName;
  /** Undoing or removing something reads as "neg"; creating as "pos". */
  tone: "pos" | "neg" | "neutral";
}

export interface SettingsJournalDay {
  day: string;
  entries: SettingsJournalEntry[];
}

/** An audit action's kind, icon and tone, from its name (PAYMENT_CREATED, LOT_DELETED…). */
export function journalLook(action: string): Pick<SettingsJournalEntry, "kind" | "icon" | "tone"> {
  const [subject] = action.split("_");
  const tone = /CANCELLED|DELETED|REMOVED|REVERSED|ARCHIVED|CLOSED/.test(action)
    ? "neg"
    : /CREATED|ADDED|OPENED|RESTORED|REOPENED/.test(action)
      ? "pos"
      : "neutral";
  const look: Record<string, Pick<SettingsJournalEntry, "kind" | "icon">> = {
    PAYMENT: { kind: "money", icon: "income" },
    EXPENSE: { kind: "money", icon: "expense" },
    OPENING: { kind: "money", icon: "treasury" },
    CYCLE: { kind: "cycles", icon: "calendar" },
    BLOC: { kind: "property", icon: "bloc" },
    LOT: { kind: "property", icon: "lots" },
    OWNER: { kind: "property", icon: "owners" },
    MEMBER: { kind: "access", icon: "user" },
    INVITATION: { kind: "access", icon: "mail" },
    RESIDENCE: { kind: "access", icon: "residence" },
  };
  return { ...(look[subject] ?? { kind: "access", icon: "history" }), tone };
}

/**
 * Everything the residence settings show — as plain data, so the same view
 * renders on the settings page and in the settings modal opened from the
 * residences list (which loads it through a server action).
 */
export interface ResidenceSettingsData {
  residence: {
    id: string;
    name: string;
    city: string;
    currency: CurrencyCode;
    slug: string;
    archived: boolean;
    base: string;
  };
  currentUserId: string;
  can: { manage: boolean; cycles: boolean };
  lotCount: number;
  members: { userId: string; name: string; email: string; role: string; since: string }[];
  invitations: { id: string; email: string; role: string }[];
  cycles: SettingsCycle[];
  hasOpenCycle: boolean;
  journal: SettingsJournalDay[];
}

export async function loadResidenceSettings(
  session: AuthorizedSession,
  residenceId: string,
  t: Dictionary,
  locale: Locale,
): Promise<ResidenceSettingsData | null> {
  const residence = await findResidenceById(residenceId);
  if (!residence) return null;
  const [cycleResult, memberResult, lotResult, treasuries, entries] = await Promise.all([
    cycles.listCycles(session, residenceId),
    members.listMembers(session, residenceId),
    lots.listLots(session, residenceId, { status: "ACTIVE" }),
    cycles.computeAllTreasuries(residenceId),
    listAuditLog(residenceId),
  ]);
  const cycleList = withSlugs(cycleResult.ok ? cycleResult.data : []);

  const settingsCycles = await Promise.all(
    cycleList.map(async (cycle): Promise<SettingsCycle> => {
      const view = toCycleView(cycle, t);
      const billed = cycle.status !== "DRAFT";
      // Two totals per cycle: one summary query, not the full lot rows.
      const summary = billed ? await summarizeAssessmentsForCycle(residenceId, cycle.id) : null;
      return {
        id: cycle.id,
        slug: cycle.slug,
        name: cycle.name,
        status: cycle.status,
        statusLabel: view.statusLabel,
        badge: view.badge,
        range: view.range,
        expectedMillimes: summary?.totalAmountMillimes ?? null,
        collectedMillimes: summary?.totalPaidMillimes ?? null,
        closingBalanceMillimes: billed ? (treasuries.get(cycle.id)?.closingBalanceMillimes ?? null) : null,
      };
    }),
  );

  const people = new Map(
    (await findUsersByIds([...new Set(entries.map((e) => e.actorUserId))])).map((u) => [u.id, u.name]),
  );
  const journal: SettingsJournalDay[] = [];
  for (const entry of entries) {
    const day = formatDate(entry.createdAt);
    const row: SettingsJournalEntry = {
      ...journalLook(entry.action),
      id: entry.id,
      time: formatDateTime(entry.createdAt, locale).slice(-5),
      who: people.get(entry.actorUserId) ?? t.someone,
      what: t[`audit${entry.action}`],
      detail: describeAuditEntry(entry, t, residence.currency),
    };
    const last = journal[journal.length - 1];
    if (last?.day === day) last.entries.push(row);
    else journal.push({ day, entries: [row] });
  }

  return {
    residence: {
      id: residence.id,
      name: residence.name,
      city: residence.city,
      currency: residence.currency,
      slug: residence.slug,
      archived: residence.status === "ARCHIVED",
      base: residencePath(residence.slug),
    },
    currentUserId: session.userId,
    can: { manage: roleHasPermission(session.role, "*"), cycles: roleHasPermission(session.role, "cycles:manage") },
    lotCount: lotResult.ok ? lotResult.data.length : 0,
    members: memberResult.ok
      ? memberResult.data.members.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          since: formatDate(m.since),
        }))
      : [],
    invitations: memberResult.ok
      ? memberResult.data.invitations.map((i) => ({ id: i.id, email: i.email, role: i.role }))
      : [],
    cycles: settingsCycles,
    hasOpenCycle: cycleList.some((c) => c.status === "OPEN"),
    journal,
  };
}
