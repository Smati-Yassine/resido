"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Bar, Badge, EmptyState } from "@/components/ui/Display";
import { useI18n } from "@/components/ui/I18nProvider";
import { interpolate } from "@/lib/i18n/dictionaries";
import { DeleteResidenceModal, ResidenceFormModal, type ResidenceDraft } from "./ResidenceModals";
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
  /** Only administrators can edit, archive or delete a residence. */
  isAdmin: boolean;
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; residence: ResidenceDraft }
  | { kind: "delete"; residence: ResidenceDraft }
  | null;

export function HomeView({ residences }: { residences: ResidenceCardView[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [modal, setModal] = useState<ModalState>(null);
  const { setArchived, pending } = useArchive();

  const active = residences.filter((r) => !r.archived);
  const archived = residences.filter((r) => r.archived);
  const visible = filter === "active" ? active : archived;
  const close = () => setModal(null);

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">{t.residencesArea}</span>
          <h1 className="display text-[44px]">{t.yourResidences}</h1>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setModal({ kind: "create" })}>
          <Icon name="plus" strokeWidth={2.2} />
          {t.newResidence}
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={filter === "active"}
          onClick={() => setFilter("active")}
        >
          {t.activeTab} · {active.length}
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={filter === "archived"}
          onClick={() => setFilter("archived")}
        >
          {t.archivedTab} · {archived.length}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={filter === "active" ? t.emptyActiveTitle : t.emptyArchivedTitle}
          text={filter === "active" ? t.emptyActiveText : t.emptyArchivedText}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <article
              key={r.id}
              className={`card card-lift flex flex-col gap-[18px] p-6 ${r.archived ? "opacity-85" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <span className="tile-icon">
                    <Icon name="residence" size={24} />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-[22px] font-semibold tracking-tight">{r.name}</span>
                    <span className="text-sm text-muted">{r.city}</span>
                  </div>
                </div>
                <Badge tone={r.archived ? "closed" : "paid"}>{r.archived ? t.statusArchived : t.statusActive}</Badge>
              </div>

              <div className="flex gap-5 text-sm text-ink-2">
                <span>
                  <b>{r.lotCount}</b> {t.lotsWord}
                </span>
                <span>
                  <b>{r.blocCount}</b> {t.blocsWord}
                </span>
                <span>
                  {r.cycleName
                    ? interpolate(r.cycleIsOpen ? t.cycleInProgress : t.lastCycle, { name: r.cycleName })
                    : t.noCycle}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted">{t.collectedOnCycle}</span>
                  <span className="num font-bold">{r.collectionRate === null ? "—" : `${r.collectionRate} %`}</span>
                </div>
                <Bar value={r.collectionRate ?? 0} tone={r.archived ? "muted" : "primary"} />
              </div>

              <div className="flex items-center gap-2 pt-1">
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
                {r.isAdmin && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.edit}
                    title={t.edit}
                    onClick={() => setModal({ kind: "edit", residence: r })}
                  >
                    <Icon name="edit" />
                  </button>
                )}
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
                {r.isAdmin && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={t.delete}
                    title={t.delete}
                    onClick={() => setModal({ kind: "delete", residence: r })}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {modal?.kind === "create" && <ResidenceFormModal onClose={close} />}
      {modal?.kind === "edit" && <ResidenceFormModal residence={modal.residence} onClose={close} />}
      {modal?.kind === "delete" && <DeleteResidenceModal residence={modal.residence} onClose={close} />}
    </>
  );
}
