"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, EmptyState, Notice } from "@/components/ui/Display";
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
import { formatAmount } from "@/lib/format";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { ResidenceSettingsData, SettingsTab } from "@/lib/settings/residence-settings";

const NAV: { key: SettingsTab; icon: IconName; label: keyof Dictionary; desc: keyof Dictionary }[] = [
  { key: "general", icon: "settings", label: "tabGeneral", desc: "navGeneralDesc" },
  { key: "cycles", icon: "calendar", label: "cycles", desc: "navCyclesDesc" },
  { key: "members", icon: "owners", label: "members", desc: "navMembersDesc" },
  { key: "journal", icon: "history", label: "journal", desc: "navJournalDesc" },
];

/**
 * The residence settings: a side navigation (General, Cycles, Members,
 * Journal) and grouped rows. The same view serves the settings page — tabs
 * are links (`hrefs`) — and the settings modal on the residences list — tabs
 * are state (`onTab`), and `onGone` closes it once the residence is deleted,
 * archived or left.
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
  return (
    <div className="flex flex-col gap-7">
      {mode === "page" && <IdentityHeader data={data} />}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t.residenceSettings}>
          {NAV.map((item) => {
            const inner = (
              <>
                <span className="settings-nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>
                  <span className="settings-nav-label">{t[item.label] as string}</span>
                  <span className="settings-nav-desc">{t[item.desc] as string}</span>
                </span>
              </>
            );
            const current = item.key === tab ? "page" : undefined;
            return hrefs ? (
              <Link key={item.key} href={hrefs[item.key]} className="settings-nav-item" aria-current={current}>
                {inner}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                className="settings-nav-item"
                aria-current={current}
                onClick={() => onTab?.(item.key)}
              >
                {inner}
              </button>
            );
          })}
        </nav>

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
      </div>
    </div>
  );
}

/** The residence as it shows: tile, name, then city · currency · lots · members. */
function IdentityHeader({ data }: { data: ResidenceSettingsData }) {
  const { t, locale } = useI18n();
  const { residence } = data;
  const facts = [
    residence.city,
    `${residence.currency} · ${CURRENCIES[residence.currency].name[locale]}`,
    `${data.lotCount} ${t.lotsWord}`,
    data.members.length === 1 ? t.memberOne : interpolate(t.membersCount, { count: data.members.length }),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="identity-tile">
        <Icon name="residence" size={26} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="subtle">{t.residenceSettings}</span>
        <h1 className="h-page flex flex-wrap items-center gap-3">
          {residence.name}
          {residence.archived && <Badge tone="draft">{t.archivedTag}</Badge>}
        </h1>
        <span className="text-sm text-muted">{facts.join(" · ")}</span>
      </div>
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
              defaultValue={residence.name}
              readOnly={!manage}
              required
            />
          </Row>
          <Row title={t.city} text={t.cityHelp}>
            <input className="input" name="city" aria-label={t.city} defaultValue={residence.city} readOnly={!manage} />
          </Row>
          {manage && (
            <div className="settings-foot">
              <button type="submit" className="btn btn-primary" disabled={pending}>
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

/** Every cycle on a timeline, newest first — create, open, close, reopen, delete, or jump into one. */
function CyclesSection({ data }: { data: ResidenceSettingsData }) {
  const { t } = useI18n();
  const { residence } = data;
  const money = (millimes: number | null) => (millimes === null ? "—" : formatAmount(millimes, residence.currency));
  return (
    <Group
      title={t.cycles}
      text={t.cyclesHelp}
      action={data.can.cycles && <NewCycleButton residenceId={residence.id} />}
    >
      {data.cycles.length === 0 ? (
        <div className="border-t border-line-soft px-6 py-8">
          <EmptyState title={t.noCycleTitle} text={t.noCycleText} />
        </div>
      ) : (
        <div className="timeline border-t border-line-soft px-6 py-3">
          {data.cycles.map((cycle) => (
            <div key={cycle.id} className="timeline-item">
              <span className="timeline-dot" data-status={cycle.status} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] px-1 py-3">
                <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                  <span className="flex items-center gap-2.5">
                    <span className="text-[17px] font-bold">{cycle.name}</span>
                    <Badge tone={cycle.badge}>{cycle.statusLabel}</Badge>
                  </span>
                  <span className="subtle">{cycle.range}</span>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
                <div className="flex flex-wrap justify-end gap-2">
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
                    <Link href={`${residence.base}?cycle=${cycle.id}`} className="btn btn-ghost">
                      {t.view}
                    </Link>
                  )}
                  {data.can.cycles && (
                    <DeleteCycleButton residenceId={residence.id} cycleId={cycle.id} cycleName={cycle.name} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Group>
  );
}

/** What happened, day by day, newest first. */
function JournalSection({ data }: { data: ResidenceSettingsData }) {
  const { t } = useI18n();
  if (data.journal.length === 0) return <EmptyState text={t.journalEmpty} />;
  return (
    <Group title={t.journal} text={t.journalHelp}>
      <div className="flex flex-col border-t border-line-soft">
        {data.journal.map((day) => (
          <div key={day.day} className="flex flex-col">
            <span className="label-caps bg-surface-2 px-6 py-2.5">{day.day}</span>
            {day.entries.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-t border-line-soft px-6 py-3 text-sm sm:grid-cols-[52px_minmax(0,220px)_minmax(0,1fr)]"
              >
                <span className="num text-[13px] text-muted">{entry.time}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{entry.what}</span>
                  <span className="block truncate text-xs text-muted">{entry.who}</span>
                </span>
                <span className="col-start-2 truncate text-[13px] text-ink-2 sm:col-start-auto">{entry.detail}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Group>
  );
}
