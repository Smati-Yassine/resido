"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge, EmptyState, StatCell } from "@/components/ui/Display";
import { useI18n } from "@/components/ui/I18nProvider";
import { FilterChips, SearchField } from "@/components/ui/Filters";
import { Ring } from "@/components/dashboard/Charts";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount } from "@/lib/format";
import type { CurrencyCode } from "@/lib/currency";
import { fold } from "@/lib/text";
import { DeleteResidenceModal, LeaveResidenceModal, ResidenceFormModal, type ResidenceDraft } from "./ResidenceModals";
import { ResidenceSettingsModal } from "./ResidenceSettingsModal";
import { ImportResidenceModal } from "./ImportResidenceModal";
import { useArchive } from "./useArchive";

export interface ResidenceCardView extends ResidenceDraft {
  /** URL key: `/residences/<slug>`. */
  slug: string;
  archived: boolean;
  lotCount: number;
  blocCount: number;
  cycleName: string | null;
  cycleIsOpen: boolean;
  collectionRate: number | null;
  /** Still to collect in the current cycle, in the residence's own currency. */
  outstandingMillimes: number | null;
  currency: CurrencyCode;
  role: string;
  /** Administrators can archive and restore a residence. */
  isAdmin: boolean;
  /** Its creator: the only one who can delete it; everyone else can leave it. */
  isOwner: boolean;
}

type ModalState =
  | { kind: "create" }
  | { kind: "import" }
  | { kind: "settings"; residence: ResidenceDraft }
  | { kind: "delete"; residence: ResidenceDraft }
  | { kind: "leave"; residence: ResidenceDraft }
  | null;

/**
 * "Mes résidences": a greeting and the figures across residences (with
 * "Import" beside "New residence"), a search and the active / archived
 * filter, then one card per residence — its collection on a ring, what is
 * still to collect, and its actions.
 */
export function HomeView({ residences, firstName }: { residences: ResidenceCardView[]; firstName: string }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const { setArchived, pending } = useArchive();

  const active = residences.filter((r) => !r.archived);
  const archived = residences.filter((r) => r.archived);
  const q = fold(query.trim());
  const visible = (filter === "active" ? active : archived).filter(
    (r) => !q || fold(r.name).includes(q) || fold(r.city).includes(q),
  );
  const close = () => setModal(null);
  // Residences the user created, then those they were invited to.
  const created = visible.filter((r) => r.isOwner);
  const shared = visible.filter((r) => !r.isOwner);
  const card = (r: ResidenceCardView) => (
    <article key={r.id} className={`card card-lift flex flex-col ${r.archived ? "opacity-85" : ""}`}>
      <div className="flex items-start justify-between gap-3 p-6 pb-0">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="tile-icon">
            <Icon name="residence" size={24} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-[22px] font-semibold tracking-tight" title={r.name}>
              {r.name}
            </span>
            <span className="truncate text-sm text-muted">
              {[r.city, r.isOwner ? t.roleCreator : (t as Record<string, string>)[`role${r.role}`]]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        {r.archived ? (
          <Badge tone="closed">{t.statusArchived}</Badge>
        ) : r.cycleName ? (
          <Badge tone={r.cycleIsOpen ? "open" : "closed"}>{r.cycleName}</Badge>
        ) : (
          <Badge tone="draft">{t.noCycle}</Badge>
        )}
      </div>

      <div className="flex items-center gap-5 px-6 py-5">
        <Ring value={r.collectionRate} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-muted">
            {r.cycleName
              ? interpolate(r.cycleIsOpen ? t.cycleInProgress : t.lastCycle, { name: r.cycleName })
              : t.noCycle}
          </span>
          {r.outstandingMillimes !== null && (
            <span className="flex flex-col">
              <span className="num text-[20px] font-bold text-neg">
                {formatAmount(r.outstandingMillimes, r.currency)}
              </span>
              <span className="text-xs text-muted">{t.toCollect}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-5 px-6 pb-5 text-sm text-ink-2">
        <span>
          <b>{r.lotCount}</b> {t.lotsWord}
        </span>
        <span>
          <b>{r.blocCount}</b> {t.blocsWord}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line-soft px-6 py-4">
        {r.archived ? (
          r.isAdmin && (
            <button
              type="button"
              className="btn btn-ghost flex-1"
              disabled={pending}
              onClick={() => setArchived(r.id, false)}
            >
              {t.restore}
            </button>
          )
        ) : (
          <Link href={`/residences/${r.slug}`} className="btn btn-primary flex-1">
            {t.open}
          </Link>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`${t.settings} — ${r.name}`}
          title={t.settings}
          onClick={() => setModal({ kind: "settings", residence: r })}
        >
          <Icon name="settings" />
        </button>
        {r.isAdmin && !r.archived && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t.archive}
            title={t.archive}
            disabled={pending}
            onClick={() => setArchived(r.id, true)}
          >
            <Icon name="archive" />
          </button>
        )}
        {r.isOwner ? (
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            aria-label={t.delete}
            title={t.delete}
            onClick={() => setModal({ kind: "delete", residence: r })}
          >
            <Icon name="trash" />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            aria-label={`${t.leave} — ${r.name}`}
            title={t.leaveRowTitle}
            onClick={() => setModal({ kind: "leave", residence: r })}
          >
            <Icon name="logout" />
          </button>
        )}
      </div>
    </article>
  );
  const rated = active.filter((r) => r.collectionRate !== null);
  const avgRate = rated.length
    ? Math.round(rated.reduce((n, r) => n + (r.collectionRate ?? 0), 0) / rated.length)
    : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">{t.residencesArea}</span>
          <h1 className="display text-[40px] md:text-[44px]">{interpolate(t.greeting, { name: firstName })}</h1>
          <p className="text-[15px] text-muted">{t.residencesIntro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-lg btn-icon-sm"
            aria-label={t.importResidence}
            title={t.importTitle}
            onClick={() => setModal({ kind: "import" })}
          >
            <Icon name="upload" />
            <span className="btn-label-sm-hide">{t.importResidence}</span>
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setModal({ kind: "create" })}>
            <Icon name="plus" strokeWidth={2.2} />
            {t.newResidence}
          </button>
        </div>
      </div>

      {residences.length > 0 && (
        <section className="card ledger" aria-label={t.yourResidences}>
          <StatCell
            label={t.activeResidences}
            value={String(active.length)}
            note={archived.length ? interpolate(t.archivedCount, { count: archived.length }) : undefined}
          />
          <StatCell label={t.totalLots} value={String(active.reduce((n, r) => n + r.lotCount, 0))} />
          <StatCell label={t.openCycles} value={String(active.filter((r) => r.cycleIsOpen).length)} />
          <StatCell label={t.avgRate} value={avgRate === null ? "—" : `${avgRate} %`} valueClass="text-pos" />
        </section>
      )}

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t.searchResidences} />
        <FilterChips
          label={t.yourResidences}
          value={filter}
          onChange={setFilter}
          options={[
            { key: "active", label: t.activeTab, count: active.length },
            { key: "archived", label: t.archivedTab, count: archived.length },
          ]}
        />
      </div>

      {visible.length === 0 && (filter === "archived" || q) ? (
        <EmptyState title={q ? undefined : t.emptyArchivedTitle} text={q ? t.noMatch : t.emptyArchivedText} />
      ) : (
        <>
          {(created.length > 0 || filter === "active") && (
            <SectionTitle title={t.createdResidences} count={created.length} />
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {created.map((r) => card(r))}
            {filter === "active" && !q && (
              <button type="button" className="add-card" onClick={() => setModal({ kind: "create" })}>
                <span className="tile-icon">
                  <Icon name="plus" size={22} />
                </span>
                <span className="text-[15px] font-bold text-ink">{t.addResidenceCard}</span>
                <span className="text-[13px]">{active.length ? t.addResidenceText : t.emptyActiveText}</span>
              </button>
            )}
          </div>
          {shared.length > 0 && (
            <>
              <SectionTitle title={t.sharedResidences} count={shared.length} hint={t.sharedResidencesHint} />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{shared.map((r) => card(r))}</div>
            </>
          )}
        </>
      )}

      {modal?.kind === "create" && <ResidenceFormModal onClose={close} />}
      {modal?.kind === "import" && <ImportResidenceModal onClose={close} />}
      {modal?.kind === "settings" && (
        <ResidenceSettingsModal residenceId={modal.residence.id} residenceName={modal.residence.name} onClose={close} />
      )}
      {modal?.kind === "delete" && <DeleteResidenceModal residence={modal.residence} onClose={close} />}
      {modal?.kind === "leave" && <LeaveResidenceModal residence={modal.residence} onClose={close} />}
    </>
  );
}

/** A heading over one group of residence cards. */
function SectionTitle({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="-mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="h-card">{title}</h2>
      <span className="tab-count ml-0">{count}</span>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}
