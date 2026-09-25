"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice } from "@/components/ui/Display";
import { FilterChips, SearchField } from "@/components/ui/Filters";
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
 * page, the route draws the header, figures and tabs around one section
 * (`hrefs` link between them); in the modal opened from the residences list,
 * a side navigation switches sections (`onTab`), and `onGone` closes it once
 * the residence is deleted, archived or left.
 */
export function ResidenceSettingsView({
  data,
  tab,
  hrefs,
  onTab,
  mode,
  onGone,
}: {
  data: ResidenceSettingsData;
  tab: SettingsTab;
  hrefs?: Record<SettingsTab, string>;
  onTab?: (tab: SettingsTab) => void;
  mode: "page" | "modal";
  onGone?: () => void;
}) {
  const { t } = useI18n();
  const section = (
    <div className="flex min-w-0 flex-col gap-5">
      {!data.can.manage && tab !== "journal" && <Notice icon="lock">{t.readOnlyNote}</Notice>}
      {tab === "general" && <GeneralSection data={data} mode={mode} hrefs={hrefs} onGone={onGone} />}
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
      {tab === "journal" && <JournalSection data={data} />}
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
  title: string;
  text?: string;
  action?: React.ReactNode;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={`card settings-group ${danger ? "settings-group-danger" : ""}`}>
      <div className="settings-group-head">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="h-card">{title}</h2>
          {text && <p className="text-[13px] text-muted">{text}</p>}
        </div>
        {action}
      </div>
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
  hrefs,
  onGone,
}: {
  data: ResidenceSettingsData;
  mode: "page" | "modal";
  hrefs?: Record<SettingsTab, string>;
  onGone?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { residence } = data;
  const manage = data.can.manage;
  // Typed name and city show in the preview as they are typed.
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

  const counts: Record<SettingsTab, string | null> = {
    general: null,
    cycles: String(data.cycles.length),
    members: String(data.members.length),
    journal: String(data.journal.reduce((n, d) => n + d.entries.length, 0)),
  };

  return (
    <div className="@container flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
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
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!changed || pending}
                    onClick={() => {
                      setName(residence.name);
                      setCity(residence.city);
                    }}
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!changed || pending}>
                    {t.save}
                  </button>
                </div>
              )}
            </Group>
          </form>

          <Group title={t.currency}>
            <Row
              title={t.currency}
              text={`${t.currencyHelp} ${interpolate(t.currencyExample, { amount: formatAmount(1234567, residence.currency) })}`}
            >
              <CurrencySelect residenceId={residence.id} currency={residence.currency} disabled={!manage} />
            </Row>
          </Group>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="card card-pad flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="h-card">{t.settingsPreview}</h2>
              <p className="text-[13px] text-muted">{t.settingsPreviewHint}</p>
            </div>
            <div className="settings-preview">
              <span className="identity-tile">
                <Icon name="residence" size={26} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-display text-[19px] font-bold">{name || residence.name}</span>
                <span className="truncate text-[13px] text-muted">{city || "—"}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {residence.archived && <Badge tone="draft">{t.archivedTag}</Badge>}
              <Badge tone="open">
                {residence.currency} · {CURRENCIES[residence.currency].symbol}
              </Badge>
              <Badge tone="closed">
                {data.lotCount} {t.lotsWord}
              </Badge>
              <Badge tone="closed">
                {data.members.length === 1 ? t.memberOne : interpolate(t.membersCount, { count: data.members.length })}
              </Badge>
            </div>
          </section>

          {hrefs && (
            <section className="card card-pad flex flex-col gap-2">
              <h2 className="h-card mb-1">{t.settingsShortcuts}</h2>
              {SETTINGS_NAV.filter((item) => item.key !== "general").map((item) => (
                <Link key={item.key} href={hrefs[item.key]} className="settings-nav-item items-center">
                  <span className="settings-nav-icon mt-0">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="settings-nav-label">{t[item.label] as string}</span>
                    <span className="settings-nav-desc">{t[item.desc] as string}</span>
                  </span>
                  {counts[item.key] !== null && <span className="tab-count">{counts[item.key]}</span>}
                </Link>
              ))}
            </section>
          )}
        </div>
      </div>

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
                <Icon name="archive" size={16} />
                {t.archive}
              </button>
            </Row>
          )}
          <Row title={t.deleteRowTitle} text={t.deleteRowText}>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
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
    </div>
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
    <div className="flex flex-wrap gap-2 @3xl:justify-end">
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

/**
 * The cycle that matters now, in front — its collection as a bar, its three
 * figures, its actions — then every cycle on a timeline, newest first.
 */
function CyclesSection({ data, mode }: { data: ResidenceSettingsData; mode: "page" | "modal" }) {
  const { t } = useI18n();
  const { residence } = data;
  const money = (millimes: number | null) => (millimes === null ? "—" : formatAmount(millimes, residence.currency));
  const featured = data.cycles.find((c) => c.status === "OPEN") ?? data.cycles.find((c) => c.status !== "DRAFT");
  const newCycle = data.can.cycles && <NewCycleButton residenceId={residence.id} />;

  if (data.cycles.length === 0) {
    return (
      <div className="card card-pad flex flex-col items-center gap-4 py-10">
        <EmptyState title={t.noCycleTitle} text={t.noCycleText} />
        {mode === "modal" && newCycle}
      </div>
    );
  }

  const rateOf = (c: SettingsCycle) => percent(c.collectedMillimes ?? 0, c.expectedMillimes ?? 0);

  return (
    <div className="flex flex-col gap-5">
      {featured && (
        <section className="card cycle-feature" data-status={featured.status}>
          <div className="flex min-w-[200px] flex-col gap-1.5">
            <span className="label-caps">{featured.status === "OPEN" ? t.cycleCurrent : t.cycleLatest}</span>
            <span className="flex flex-wrap items-center gap-2.5">
              <span className="font-display text-[26px] font-bold leading-tight">{featured.name}</span>
              <Badge tone={featured.badge}>{featured.statusLabel}</Badge>
            </span>
            <span className="subtle">{featured.range}</span>
          </div>
          <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
            <span className="num font-display text-[30px] font-bold leading-none">{rateOf(featured)} %</span>
            <div className="bar h-2.5">
              <div className="bar-fill bar-fill-pos" style={{ width: `${Math.min(100, rateOf(featured))}%` }} />
            </div>
            <span className="text-[13px] text-muted">
              {interpolate(t.cycleCollectedOf, {
                collected: money(featured.collectedMillimes),
                expected: money(featured.expectedMillimes),
              })}
            </span>
          </div>
          <dl className="flex gap-6 text-sm">
            <div className="flex flex-col">
              <dt className="text-xs text-muted">{t.endBalance}</dt>
              <dd className="num text-[18px] font-bold">{money(featured.closingBalanceMillimes)}</dd>
            </div>
          </dl>
          <CycleActions data={data} cycle={featured} />
        </section>
      )}

      <Group title={t.cyclesAll} text={t.cyclesHelp} action={mode === "modal" && newCycle}>
        <div className="@container timeline border-t border-line-soft px-6 py-3">
          {data.cycles.map((cycle) => {
            const billed = cycle.expectedMillimes !== null;
            return (
              <div key={cycle.id} className="timeline-item">
                <span className="timeline-dot" data-status={cycle.status} aria-hidden="true" />
                <div className="grid grid-cols-1 gap-3 px-1 py-3 @3xl:grid-cols-[180px_minmax(0,1fr)_auto] @3xl:items-center @3xl:gap-6">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2.5">
                      <span className="text-[17px] font-bold">{cycle.name}</span>
                      <Badge tone={cycle.badge}>{cycle.statusLabel}</Badge>
                    </span>
                    <span className="subtle">{cycle.range}</span>
                  </div>
                  {billed ? (
                    <div className="flex min-w-0 flex-col gap-2">
                      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <div className="flex flex-col">
                          <dt className="text-xs text-muted">{t.expected}</dt>
                          <dd className="num font-bold">{money(cycle.expectedMillimes)}</dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-xs text-muted">{t.collected}</dt>
                          <dd className="num text-pos font-bold">{money(cycle.collectedMillimes)}</dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-xs text-muted">{t.endBalance}</dt>
                          <dd className="num font-bold">{money(cycle.closingBalanceMillimes)}</dd>
                        </div>
                      </dl>
                      <div className="flex items-center gap-2.5">
                        <div className="bar h-1.5 flex-1">
                          <div
                            className={`bar-fill ${cycle.status === "OPEN" ? "" : "bar-fill-pos"}`}
                            style={{ width: `${Math.min(100, rateOf(cycle))}%` }}
                          />
                        </div>
                        <b className="num w-11 text-right text-[13px]">{rateOf(cycle)} %</b>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted">{t.cycleDraftNote}</span>
                  )}
                  <CycleActions data={data} cycle={cycle} />
                </div>
              </div>
            );
          })}
        </div>
      </Group>
    </div>
  );
}

/* ---------- Journal ---------- */

const KINDS: JournalKind[] = ["money", "cycles", "property", "access"];
/** Journal entries shown at first, and added by each "show more". */
const PAGE = 40;

/** What happened, day by day, newest first — searchable, filtered by kind. */
function JournalSection({ data }: { data: ResidenceSettingsData }) {
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
        <div className="max-w-full overflow-x-auto">
          <FilterChips
            label={t.journalFilter}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setLimit(PAGE);
            }}
            options={[
              { key: "all" as const, label: t.filterAll, count: counts.all },
              ...KINDS.map((k) => ({ key: k, label: t[`kind${k}`], count: counts[k] })),
            ]}
          />
        </div>
      </div>

      <Group
        title={t.journal}
        text={t.journalHelp}
        action={<Badge tone="closed">{interpolate(t.journalCount, { count: shown })}</Badge>}
      >
        {days.length === 0 ? (
          <p className="border-t border-line-soft px-6 py-8 text-center text-sm text-muted">{t.noMatch}</p>
        ) : (
          <div className="flex flex-col border-t border-line-soft">
            {visible.map((day) => (
              <div key={day.day} className="flex flex-col">
                <span className="label-caps bg-surface-2 px-6 py-2.5">{day.day}</span>
                {day.entries.map((entry) => (
                  <div key={entry.id} className="journal-row">
                    <span className="journal-icon" data-kind={entry.kind} data-tone={entry.tone} aria-hidden="true">
                      <Icon name={entry.icon} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{entry.what}</span>
                      <span className="truncate text-[13px] text-ink-2">{entry.detail}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-right">
                      <span className="num text-[13px] font-semibold">{entry.time}</span>
                      <span className="max-w-[160px] truncate text-xs text-muted">{entry.who}</span>
                    </span>
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
