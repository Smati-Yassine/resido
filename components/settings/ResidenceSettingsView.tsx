"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice } from "@/components/ui/Display";
import { SearchField } from "@/components/ui/Filters";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { useAfterAction } from "@/components/ui/AfterAction";
import { setResidenceCurrencyAction, updateResidenceAction } from "@/lib/actions/residences";
import { DeleteResidenceModal } from "@/components/residences/ResidenceModals";
import { useArchive } from "@/components/residences/useArchive";
import { MembersPanel } from "@/components/workspace/Members";
import {
  CloseCycleButton,
  DeleteCycleButton,
  NewCycleButton,
  OpenCycleButton,
  ReopenCycleButton,
} from "@/components/workspace/CycleControls";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { formatAmount, percent } from "@/lib/format";
import { fold } from "@/lib/text";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { JournalKind, ResidenceSettingsData, SettingsCycle, SettingsTab } from "@/lib/settings/residence-settings";

export const SETTINGS_NAV: { key: SettingsTab; icon: IconName; label: keyof Dictionary; desc: keyof Dictionary }[] = [
  { key: "general", icon: "settings", label: "tabGeneral", desc: "navGeneralDesc" },
  { key: "cycles", icon: "calendar", label: "cycles", desc: "navCyclesDesc" },
  { key: "members", icon: "user", label: "members", desc: "navMembersDesc" },
  { key: "journal", icon: "history", label: "journal", desc: "navJournalDesc" },
];

/**
 * The residence settings: General, Cycles, Members, Journal. On the settings
 * pages (one per sidebar entry) it is just the section; in the modal opened
 * from the residences list, a side navigation switches sections (`onTab`),
 * and `onGone` closes it once the residence is deleted, archived or left.
 */
export function ResidenceSettingsView({
  data,
  tab,
  onTab,
  mode,
  onGone,
}: {
  data: ResidenceSettingsData;
  tab: SettingsTab;
  onTab?: (tab: SettingsTab) => void;
  mode: "page" | "modal";
  onGone?: () => void;
}) {
  const { t } = useI18n();
  const section = (
    <div className="flex min-w-0 flex-col gap-5">
      {!data.can.manage && tab !== "journal" && <Notice icon="lock">{t.readOnlyNote}</Notice>}
      {tab === "general" && <GeneralSection data={data} mode={mode} onGone={onGone} />}
      {tab === "cycles" && <CyclesSection data={data} mode={mode} />}
      {tab === "members" && (
        <MembersPanel
          residenceId={data.residence.id}
          residenceName={data.residence.name}
          currentUserId={data.currentUserId}
          canManage={data.can.manage}
          members={data.members}
          invitations={data.invitations}
        />
      )}
      {tab === "journal" && <JournalSection data={data} mode={mode} />}
    </div>
  );
  if (mode === "page") return section;

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t.residenceSettings}>
        {SETTINGS_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className="settings-nav-item"
            aria-current={item.key === tab ? "page" : undefined}
            onClick={() => onTab?.(item.key)}
          >
            <span className="settings-nav-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span>
              <span className="settings-nav-label">{t[item.label] as string}</span>
              <span className="settings-nav-desc">{t[item.desc] as string}</span>
            </span>
          </button>
        ))}
      </nav>
      {section}
    </div>
  );
}

function Group({
  title,
  text,
  action,
  danger = false,
  children,
}: {
  /** None when the page title already says it: the card is just its rows. */
  title?: string;
  text?: string;
  action?: React.ReactNode;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={`card settings-group ${danger ? "settings-group-danger" : ""}`}>
      {title && (
        <div className="settings-group-head">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="h-card">{title}</h2>
            {text && <p className="text-[13px] text-muted">{text}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <span className="settings-row-title">{title}</span>
        {text && <span className="settings-row-text">{text}</span>}
      </div>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/* ---------- General ---------- */

function GeneralSection({
  data,
  mode,
  onGone,
}: {
  data: ResidenceSettingsData;
  mode: "page" | "modal";
  onGone?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { residence } = data;
  const manage = data.can.manage;
  const [name, setName] = useState(residence.name);
  const [city, setCity] = useState(residence.city);
  const [onSubmit, pending] = useActionToast(updateResidenceAction, (result) => {
    // On the page, a new name means a new slug: stay here, under the new URL.
    const slug = result.data?.slug;
    if (mode === "page" && slug && !pathname.startsWith(`/residences/${slug}/`)) {
      router.replace(pathname.replace(/^\/residences\/[^/]+/, `/residences/${slug}`) + window.location.search);
    }
  });
  const { setArchived, pending: archiving } = useArchive();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const leave = () => (mode === "page" ? router.push("/residences") : onGone?.());
  const changed = name !== residence.name || city !== residence.city;

  return (
    <>
      <form onSubmit={onSubmit}>
        <Group title={t.identity} text={t.identityHelp}>
          <input type="hidden" name="residenceId" value={residence.id} />
          <Row title={t.name} text={t.nameHelp}>
            <input
              className="input"
              name="name"
              aria-label={t.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!manage}
              required
            />
          </Row>
          <Row title={t.city} text={t.cityHelp}>
            <input
              className="input"
              name="city"
              aria-label={t.city}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              readOnly={!manage}
            />
          </Row>
          {manage && (
            <div className="settings-foot">
              <button type="submit" className="btn btn-primary" disabled={!changed || pending}>
                {t.save}
              </button>
            </div>
          )}
        </Group>
      </form>

      <Group title={t.currency}>
        <Row title={t.currency} text={t.currencyHelp}>
          <CurrencySelect residenceId={residence.id} currency={residence.currency} disabled={!manage} />
        </Row>
      </Group>

      {manage && (
        <Group title={t.dangerZone} danger>
          {residence.archived ? (
            <Row title={t.restoreRowTitle} text={t.restoreRowText}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={archiving}
                onClick={() => setArchived(residence.id, false)}
              >
                {t.restore}
              </button>
            </Row>
          ) : (
            <Row title={t.archiveRowTitle} text={t.archiveRowText}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={archiving}
                onClick={() => setArchived(residence.id, true, leave)}
              >
                {t.archive}
              </button>
            </Row>
          )}
          <Row title={t.deleteRowTitle} text={t.deleteRowText}>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              {t.delete}
            </button>
          </Row>
        </Group>
      )}

      {confirmDelete && (
        <DeleteResidenceModal
          residence={residence}
          onClose={() => setConfirmDelete(false)}
          afterDelete={() => {
            if (mode === "page") {
              router.replace("/residences");
              router.refresh();
            } else onGone?.();
          }}
        />
      )}
    </>
  );
}

/** The residence's currency: changes symbol and decimals everywhere, never the stored amounts. */
function CurrencySelect({
  residenceId,
  currency,
  disabled,
}: {
  residenceId: string;
  currency: CurrencyCode;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const afterAction = useAfterAction();
  const [pending, startTransition] = useTransition();
  return (
    <select
      className="input"
      aria-label={t.currency}
      value={currency}
      disabled={disabled || pending}
      onChange={(event) =>
        startTransition(async () => {
          const result = await setResidenceCurrencyAction(residenceId, event.target.value);
          toast({ tone: result.ok ? "success" : "danger", text: result.message });
          if (result.ok) afterAction();
        })
      }
    >
      {CURRENCY_CODES.map((code) => (
        <option key={code} value={code}>
          {code} · {CURRENCIES[code].symbol} — {CURRENCIES[code].name[locale]}
        </option>
      ))}
    </select>
  );
}

/* ---------- Cycles ---------- */

/** What can be done with a cycle, as buttons: close, reopen, open, view, delete. */
function CycleActions({ data, cycle }: { data: ResidenceSettingsData; cycle: SettingsCycle }) {
  const { t } = useI18n();
  const { residence } = data;
  return (
    <div className="flex flex-wrap gap-2">
      {data.can.cycles && cycle.status === "OPEN" && cycle.closingBalanceMillimes !== null && (
        <CloseCycleButton
          residenceId={residence.id}
          cycleId={cycle.id}
          cycleName={cycle.name}
          closingBalanceMillimes={cycle.closingBalanceMillimes}
        />
      )}
      {data.can.cycles && cycle.status === "CLOSED" && (
        <ReopenCycleButton residenceId={residence.id} cycleId={cycle.id} />
      )}
      {data.can.cycles && cycle.status === "DRAFT" && !data.hasOpenCycle && (
        <OpenCycleButton residenceId={residence.id} cycleId={cycle.id} />
      )}
      {cycle.status !== "DRAFT" && (
        <Link href={`${residence.base}?cycle=${cycle.slug}`} className="btn btn-ghost">
          {t.view}
        </Link>
      )}
      {data.can.cycles && <DeleteCycleButton residenceId={residence.id} cycleId={cycle.id} cycleName={cycle.name} />}
    </div>
  );
}

/** Every cycle, newest first: its dates, what it billed and collected, its balance — and what can be done with it. */
function CyclesSection({ data, mode }: { data: ResidenceSettingsData; mode: "page" | "modal" }) {
  const { t } = useI18n();
  const { residence } = data;
  const money = (millimes: number | null) => (millimes === null ? "—" : formatAmount(millimes, residence.currency));
  return (
    <Group
      title={mode === "modal" ? t.cycles : undefined}
      text={t.cyclesHelp}
      action={mode === "modal" && data.can.cycles && <NewCycleButton residenceId={residence.id} />}
    >
      {data.cycles.length === 0 ? (
        <div className="border-t border-line-soft px-6 py-8">
          <EmptyState title={t.noCycleTitle} text={t.noCycleText} />
        </div>
      ) : (
        data.cycles.map((cycle) => (
          <div key={cycle.id} className="settings-list-row">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2.5">
                <span className="font-bold">{cycle.name}</span>
                <Badge tone={cycle.badge}>{cycle.statusLabel}</Badge>
              </span>
              <span className="text-[13px] text-muted">{cycle.range}</span>
              <span className="text-[13px] text-muted">
                {cycle.expectedMillimes === null
                  ? t.cycleDraftNote
                  : `${t.expected} ${money(cycle.expectedMillimes)} · ${t.collected} ${money(cycle.collectedMillimes)} (${percent(cycle.collectedMillimes ?? 0, cycle.expectedMillimes)} %) · ${t.endBalance} ${money(cycle.closingBalanceMillimes)}`}
              </span>
            </div>
            <CycleActions data={data} cycle={cycle} />
          </div>
        ))
      )}
    </Group>
  );
}

/* ---------- Journal ---------- */

const KINDS: JournalKind[] = ["money", "cycles", "property", "access"];
/** Journal entries shown at first, and added by each "show more". */
const PAGE = 40;

/** What happened, day by day, newest first — searchable, filtered by kind. */
function JournalSection({ data, mode }: { data: ResidenceSettingsData; mode: "page" | "modal" }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<JournalKind | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  const all = data.journal.flatMap((d) => d.entries);
  const counts = useMemo(() => {
    const byKind = { all: all.length } as Record<JournalKind | "all", number>;
    for (const k of KINDS) byKind[k] = all.filter((e) => e.kind === k).length;
    return byKind;
  }, [all]);

  if (all.length === 0) return <EmptyState text={t.journalEmpty} />;

  const needle = fold(query.trim());
  const days = data.journal
    .map((day) => ({
      ...day,
      entries: day.entries.filter(
        (e) =>
          (kind === "all" || e.kind === kind) && (!needle || fold(`${e.what} ${e.detail} ${e.who}`).includes(needle)),
      ),
    }))
    .filter((day) => day.entries.length > 0);
  const shown = days.reduce((n, d) => n + d.entries.length, 0);
  // Only the first `limit` matching entries, whole days kept in order.
  const visible = days.reduce<{ days: typeof days; left: number }>(
    (acc, day) => {
      const entries = day.entries.slice(0, acc.left);
      return entries.length ? { days: [...acc.days, { ...day, entries }], left: acc.left - entries.length } : acc;
    },
    { days: [], left: limit },
  ).days;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setLimit(PAGE);
            }}
            placeholder={t.journalSearch}
          />
        </div>
        <select
          className="input w-auto"
          aria-label={t.journalFilter}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as JournalKind | "all");
            setLimit(PAGE);
          }}
        >
          <option value="all">
            {t.filterAll} ({counts.all})
          </option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t[`kind${k}`]} ({counts[k]})
            </option>
          ))}
        </select>
      </div>

      <Group title={mode === "modal" ? t.journal : undefined} text={t.journalHelp}>
        {days.length === 0 ? (
          <p className="border-t border-line-soft px-6 py-8 text-center text-sm text-muted">{t.noMatch}</p>
        ) : (
          <div className="journal-days flex flex-col">
            {visible.map((day) => (
              <div key={day.day} className="flex flex-col">
                <span className="label-caps bg-surface-2 px-6 py-2.5">{day.day}</span>
                {day.entries.map((entry) => (
                  <div key={entry.id} className="journal-row">
                    <span className="num text-[13px] text-muted">{entry.time}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{entry.what}</span>
                      <span className="truncate text-[13px] text-muted">{entry.detail}</span>
                    </span>
                    <span className="max-w-[160px] truncate text-[13px] text-muted">{entry.who}</span>
                  </div>
                ))}
              </div>
            ))}
            {shown > limit && (
              <div className="flex justify-center border-t border-line-soft px-6 py-4">
                <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
                  {interpolate(t.journalMore, { count: Math.min(PAGE, shown - limit), total: shown - limit })}
                </button>
              </div>
            )}
          </div>
        )}
      </Group>
    </div>
  );
}
