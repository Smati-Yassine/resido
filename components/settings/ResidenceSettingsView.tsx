"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IconName } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice } from "@/components/ui/Display";
import { SearchField } from "@/components/ui/Filters";
import { Group, Row, SettingsTabs } from "./SettingsParts";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { useAfterAction } from "@/components/ui/AfterAction";
import { setResidenceCurrencyAction, updateResidenceAction } from "@/lib/actions/residences";
import { DeleteResidenceModal } from "@/components/residences/ResidenceModals";
import { useArchive } from "@/components/residences/useArchive";
import { MembersPanel } from "@/components/workspace/Members";
import { CycleMenu, NewCycleButton } from "@/components/workspace/CycleControls";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { formatAmount, percent } from "@/lib/format";
import { fold } from "@/lib/text";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { JournalKind, ResidenceSettingsData, SettingsTab } from "@/lib/settings/residence-settings";

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
      {tab === "cycles" && <CyclesSection data={data} />}
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

  // In the modal: the page's tabs across the top, so each section gets the full width.
  const counts: Record<SettingsTab, number | null> = {
    general: null,
    cycles: data.cycles.length,
    members: data.members.length,
    journal: data.journal.reduce((n, d) => n + d.entries.length, 0),
  };
  return (
    <div className="flex flex-col gap-5">
      <SettingsTabs
        label={t.residenceSettings}
        value={tab}
        onChange={(key) => onTab?.(key)}
        items={SETTINGS_NAV.map((item) => ({ key: item.key, label: t[item.label] as string, count: counts[item.key] }))}
        action={tab === "cycles" && data.can.cycles && <NewCycleButton residenceId={data.residence.id} />}
      />
      {section}
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
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-2">
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

const CYCLE_COLS =
  "grid-cols-[minmax(0,1fr)_auto_36px] @3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_36px]";

/** Every cycle, newest first, as a table: dates, billed, collected, collection rate, balance, and a menu of actions. */
function CyclesSection({ data }: { data: ResidenceSettingsData }) {
  const { t } = useI18n();
  const { residence } = data;
  const money = (millimes: number | null) => (millimes === null ? "—" : formatAmount(millimes, residence.currency));
  if (data.cycles.length === 0) {
    return <EmptyState title={t.noCycleTitle} text={t.noCycleText} />;
  }
  return (
    <section className="@container card data-table">
      <div className={`data-head ${CYCLE_COLS}`}>
        <span>{t.colCycle}</span>
        <span className="hidden text-right @3xl:block">{t.expected}</span>
        <span className="hidden text-right @3xl:block">{t.collected}</span>
        <span>{t.kpiRate}</span>
        <span className="hidden text-right @3xl:block">{t.endBalance}</span>
        <span />
      </div>
      {data.cycles.map((cycle) => {
        const billed = cycle.expectedMillimes !== null;
        const rate = percent(cycle.collectedMillimes ?? 0, cycle.expectedMillimes ?? 0);
        return (
          <div key={cycle.id} className={`data-row ${CYCLE_COLS}`}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate font-bold">{cycle.name}</span>
                <Badge tone={cycle.badge}>{cycle.statusLabel}</Badge>
              </span>
              <span className="truncate text-[13px] text-muted">{cycle.range}</span>
            </span>
            <span className="num hidden text-right @3xl:block">{money(cycle.expectedMillimes)}</span>
            <span className="num hidden text-right @3xl:block">{money(cycle.collectedMillimes)}</span>
            {billed ? (
              <span className="flex items-center gap-2.5">
                <span className="bar hidden h-1.5 flex-1 @3xl:block">
                  <span
                    className={`bar-fill block ${cycle.status === "OPEN" ? "" : "bar-fill-pos"}`}
                    style={{ width: `${Math.min(100, rate)}%` }}
                  />
                </span>
                <b className="num w-11 text-right text-[13px]">{rate} %</b>
              </span>
            ) : (
              <span className="text-[13px] text-muted">{t.cycleDraftNote}</span>
            )}
            <span className="num hidden text-right font-semibold @3xl:block">
              {money(cycle.closingBalanceMillimes)}
            </span>
            <span className="flex justify-end">
              <CycleMenu
                residenceId={residence.id}
                cycle={cycle}
                viewHref={`${residence.base}?cycle=${cycle.slug}`}
                canManage={data.can.cycles}
                canOpen={!data.hasOpenCycle}
              />
            </span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------- Journal ---------- */

const KINDS: JournalKind[] = ["money", "cycles", "property", "access"];
/** Journal entries shown at first, and added by each "show more". */
const PAGE = 40;
const JOURNAL_COLS =
  "grid-cols-[96px_minmax(0,1fr)] @3xl:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,160px)]";

/** What happened, newest first, as a table — searchable, filtered by kind, 40 rows at a time. */
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
  // One row per entry, newest first; the first `limit` of those that match.
  const rows = days.flatMap((day) => day.entries.map((entry) => ({ ...entry, day: day.day })));
  const shown = rows.length;
  const visible = rows.slice(0, limit);

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

      <section className="@container card data-table">
        <div className={`data-head ${JOURNAL_COLS}`}>
          <span>{t.colDate}</span>
          <span>{t.colAction}</span>
          <span className="hidden @3xl:block">{t.colDetail}</span>
          <span className="hidden @3xl:block">{t.colBy}</span>
        </div>
        {visible.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">{t.noMatch}</p>
        ) : (
          visible.map((entry) => (
            <div key={entry.id} className={`data-row ${JOURNAL_COLS}`}>
              <span className="flex flex-col">
                <span className="num text-[13px]">{entry.day}</span>
                <span className="num text-xs text-muted">{entry.time}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{entry.what}</span>
                <span className="truncate text-[13px] text-muted @3xl:hidden">{entry.detail}</span>
              </span>
              <span className="hidden truncate text-[13px] text-ink-2 @3xl:block">{entry.detail}</span>
              <span className="hidden truncate text-[13px] text-muted @3xl:block">{entry.who}</span>
            </div>
          ))
        )}
        {shown > limit && (
          <div className="flex justify-center px-6 py-4">
            <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
              {interpolate(t.journalMore, { count: Math.min(PAGE, shown - limit), total: shown - limit })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
