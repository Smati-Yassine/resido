"use client";

import { useState } from "react";
import { Badge, EmptyState, StatCell } from "@/components/ui/Display";
import { useI18n } from "@/components/ui/I18nProvider";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { FilterChips, SearchField } from "@/components/ui/Filters";
import { OwnerRowActions, type LotChoice } from "@/components/workspace/OwnerModals";
import { formatAmount, formatMoney, initials, percent } from "@/lib/format";
import { fold } from "@/lib/text";

type LotStatus = "PAID" | "PARTIAL" | "UNPAID" | "NONE";

export interface OwnerLot {
  id: string;
  code: string;
  bloc: string;
  status: LotStatus;
}

/** One owner as the page shows them for the cycle on screen. */
export interface OwnerItem {
  id: string;
  name: string;
  phone: string | null;
  lots: OwnerLot[];
  chargedMillimes: number;
  paidMillimes: number;
}

type Filter = "ALL" | "OWING" | "CLEAR";

/**
 * The owners page below its header: figures, a search and a filter, the
 * owners as cards — their lots as tiles coloured by status, what they still
 * owe — and the lots nobody owns yet.
 */
export function OwnersBoard({
  owners,
  unassigned,
  lotCount,
  billed,
  residenceId,
  canManage,
  choices,
}: {
  owners: OwnerItem[];
  unassigned: OwnerLot[];
  lotCount: number;
  billed: boolean;
  residenceId: string;
  canManage: boolean;
  choices: LotChoice[];
}) {
  const { t } = useI18n();
  const { code: currency } = useCurrency();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const due = (o: OwnerItem) => o.chargedMillimes - o.paidMillimes;
  const owing = owners.filter((o) => due(o) > 0);
  const totalDue = owners.reduce((n, o) => n + due(o), 0);
  const q = fold(query.trim());
  const shown = owners.filter(
    (o) =>
      (filter === "ALL" || (filter === "OWING" ? due(o) > 0 : due(o) <= 0)) &&
      (!q || fold(o.name).includes(q) || (o.phone ?? "").includes(q) || o.lots.some((l) => fold(l.code).includes(q))),
  );

  return (
    <>
      <section className="card ledger" aria-label={t.owners}>
        <StatCell label={t.owners} value={String(owners.length)} />
        <StatCell
          label={t.assignedLots}
          value={`${lotCount - unassigned.length} / ${lotCount}`}
          note={`${percent(lotCount - unassigned.length, lotCount)} %`}
        />
        <StatCell label={t.unassignedTitle} value={String(unassigned.length)} />
        {billed ? (
          <StatCell
            label={t.totalDue}
            value={formatMoney(totalDue, currency)}
            valueClass={totalDue > 0 ? "text-neg" : "text-pos"}
            note={`${owing.length} ${t.ownersOwing.toLowerCase()}`}
          />
        ) : (
          <StatCell
            label={t.annualTotal}
            value={formatMoney(
              owners.reduce((n, o) => n + o.chargedMillimes, 0),
              currency,
            )}
          />
        )}
      </section>

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t.searchOwners} />
        {billed && (
          <FilterChips
            label={t.filterStatus}
            value={filter}
            onChange={setFilter}
            options={[
              { key: "ALL", label: t.filterAll, count: owners.length },
              { key: "OWING", label: t.ownersOwing, count: owing.length },
              { key: "CLEAR", label: t.upToDate, count: owners.length - owing.length },
            ]}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          text={owners.length ? t.noMatch : t.noOwnersText}
          title={owners.length ? undefined : t.noOwnersTitle}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((owner) => {
            const left = due(owner);
            const rate = percent(owner.paidMillimes, owner.chargedMillimes);
            return (
              <article key={owner.id} className="card flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="avatar">{initials(owner.name)}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-bold" title={owner.name}>
                      {owner.name}
                    </span>
                    <span className="truncate text-[13px] text-muted">{owner.phone ?? t.noPhone}</span>
                  </div>
                  {canManage && (
                    <OwnerRowActions
                      residenceId={residenceId}
                      lots={choices}
                      owner={{
                        id: owner.id,
                        name: owner.name,
                        phone: owner.phone,
                        lotIds: owner.lots.map((l) => l.id),
                      }}
                    />
                  )}
                </div>

                {owner.lots.length ? (
                  <div className="lot-map">
                    {owner.lots.map((l) => (
                      <span
                        key={l.id}
                        className="lot-tile lot-tile-sm"
                        data-status={l.status}
                        title={`${l.code} · ${l.bloc}`}
                      >
                        {l.code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[13px] text-muted">{t.ownerNoLots}</span>
                )}

                <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-muted">{billed ? t.colDue : t.annualTotal}</span>
                    {billed && left <= 0 && owner.lots.length > 0 ? (
                      <Badge tone="paid">{t.upToDate}</Badge>
                    ) : (
                      <b className={`num ${billed ? "text-neg" : ""}`}>
                        {formatAmount(billed ? left : owner.chargedMillimes, currency)}
                      </b>
                    )}
                  </div>
                  {billed && owner.chargedMillimes > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="bar flex-1">
                        <span className="bar-fill bar-fill-pos block" style={{ width: `${rate}%` }} />
                      </span>
                      <span className="num w-10 text-right text-xs text-muted">{rate} %</span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <section className="card flex flex-col gap-3 border-dashed p-5">
          <div className="flex flex-col gap-1">
            <h2 className="h-card">
              {t.unassignedTitle} · {unassigned.length}
            </h2>
            <p className="text-[13px] text-muted">{t.unassignedHint}</p>
          </div>
          <div className="lot-map">
            {unassigned.map((l) => (
              <span key={l.id} className="lot-tile lot-tile-sm" data-status={l.status} title={`${l.code} · ${l.bloc}`}>
                {l.code}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
