"use client";

import { useState } from "react";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui/Display";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { FilterChips, SearchField } from "@/components/ui/Filters";
import { LotRowActions } from "@/components/workspace/LotRowActions";
import type { EditableLot } from "@/components/workspace/LotModals";
import { formatAmount, formatMoney, initials, percent } from "@/lib/format";
import { fold } from "@/lib/text";

type Status = "PAID" | "PARTIAL" | "UNPAID";
const TONE: Record<Status, BadgeTone> = { PAID: "paid", PARTIAL: "partial", UNPAID: "unpaid" };

/** One lot as the page shows it for the cycle on screen. */
export interface LotItem {
  id: string;
  code: string;
  blocId: string | null;
  blocName: string;
  ownerName: string | null;
  /** What the cycle bills the lot — its annual charge outside a billed cycle. */
  chargeMillimes: number;
  /** Null outside a billed cycle (nothing is paid in a draft). */
  paidMillimes: number | null;
  status: Status | null;
  edit: EditableLot;
}

type Option = { id: string; name: string };

/**
 * The lots page below its header: figures, blocs (which filter), a search
 * and a status filter, then the table. Everything filters in place.
 */
export function LotsBoard({
  items,
  blocs,
  billed,
  residenceId,
  canEdit,
  owners,
}: {
  items: LotItem[];
  blocs: Option[];
  billed: boolean;
  residenceId: string;
  canEdit: boolean;
  owners: Option[];
}) {
  const { t } = useI18n();
  const { code: currency } = useCurrency();
  const [bloc, setBloc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const sum = (list: LotItem[], pick: (i: LotItem) => number) => list.reduce((n, i) => n + pick(i), 0);
  const count = (list: LotItem[], s: Status) => list.filter((i) => i.status === s).length;

  const inBloc = bloc ? items.filter((i) => i.blocId === bloc) : items;
  const q = fold(query.trim());
  const shown = inBloc.filter(
    (i) =>
      (status === "ALL" || i.status === status) &&
      (!q || fold(i.code).includes(q) || (!!i.ownerName && fold(i.ownerName).includes(q))),
  );

  const grid = billed
    ? canEdit
      ? "grid-cols-[minmax(110px,1fr)_minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,0.8fr)_84px]"
      : "grid-cols-[minmax(110px,1fr)_minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,0.8fr)]"
    : canEdit
      ? "grid-cols-[minmax(110px,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_84px]"
      : "grid-cols-[minmax(110px,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]";

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
        <BlocCard
          name={t.allBlocs}
          list={items}
          billed={billed}
          selected={bloc === null}
          onClick={() => setBloc(null)}
        />
        {blocs.map((b) => (
          <BlocCard
            key={b.id}
            name={b.name}
            list={items.filter((i) => i.blocId === b.id)}
            billed={billed}
            selected={bloc === b.id}
            onClick={() => setBloc(bloc === b.id ? null : b.id)}
          />
        ))}
      </div>

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t.searchLots} />
        {billed && (
          <FilterChips
            label={t.filterStatus}
            value={status}
            onChange={setStatus}
            options={[
              { key: "ALL", label: t.filterAll, count: inBloc.length },
              { key: "PAID", label: t.paidPlural, count: count(inBloc, "PAID") },
              { key: "PARTIAL", label: t.partialPlural, count: count(inBloc, "PARTIAL") },
              { key: "UNPAID", label: t.unpaidPlural, count: count(inBloc, "UNPAID") },
            ]}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState text={t.noMatch} />
      ) : (
        <div className="card data-table">
          <div className={`data-head ${grid}`}>
            <span>{t.colLot}</span>
            <span>{t.colOwner}</span>
            <span className="text-right">{billed ? t.colCharge : t.annualTotal}</span>
            {billed && <span className="text-right">{t.colPaid}</span>}
            {billed && <span className="text-right">{t.colRemaining}</span>}
            {billed && <span className="text-right">{t.colStatus}</span>}
            {canEdit && <span />}
          </div>
          {shown.map((lot) => {
            const left = lot.chargeMillimes - (lot.paidMillimes ?? 0);
            return (
              <div key={lot.id} className={`data-row ${grid}`}>
                <span className="min-w-0">
                  <span className="block font-bold">{lot.code}</span>
                  <span className="block truncate text-xs text-muted">{lot.blocName}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  {lot.ownerName ? (
                    <>
                      <span className="avatar avatar-sm">{initials(lot.ownerName)}</span>
                      <span className="truncate text-ink-2" title={lot.ownerName}>
                        {lot.ownerName}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </span>
                <span className="num text-right">{formatMoney(lot.chargeMillimes, currency)}</span>
                {billed && (
                  <span className="num text-pos text-right">{formatMoney(lot.paidMillimes ?? 0, currency)}</span>
                )}
                {billed && (
                  <span className="flex flex-col items-end gap-1.5">
                    <span className="num font-semibold">{formatMoney(left, currency)}</span>
                    <span className="bar bar-stack-sm block w-full max-w-[110px]">
                      <span
                        className="bar-fill bar-fill-pos block"
                        style={{ width: `${percent(lot.paidMillimes ?? 0, lot.chargeMillimes)}%` }}
                      />
                    </span>
                  </span>
                )}
                {billed && (
                  <span className="text-right">
                    {lot.status && <Badge tone={TONE[lot.status]}>{t[`status${lot.status}`]}</Badge>}
                  </span>
                )}
                {canEdit && <LotRowActions residenceId={residenceId} blocs={blocs} owners={owners} lot={lot.edit} />}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-right text-xs text-muted">
        {shown.length} / {items.length} {t.lotsWord} ·{" "}
        {formatAmount(
          sum(shown, (i) => i.chargeMillimes),
          currency,
        )}
      </p>
    </>
  );
}

/** A bloc as a filter: its lots, how much is collected, and the paid / partial / unpaid split. */
function BlocCard({
  name,
  list,
  billed,
  selected,
  onClick,
}: {
  name: string;
  list: LotItem[];
  billed: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const expected = list.reduce((n, i) => n + i.chargeMillimes, 0);
  const paid = list.reduce((n, i) => n + (i.paidMillimes ?? 0), 0);
  const share = (s: Status) => `${list.length ? (list.filter((i) => i.status === s).length / list.length) * 100 : 0}%`;
  return (
    <button type="button" className="filter-card" aria-pressed={selected} onClick={onClick}>
      <span className="flex items-center gap-2 text-[15px] font-bold">
        <span className="text-primary">
          <Icon name="bloc" size={16} />
        </span>
        <span className="truncate">{name}</span>
      </span>
      <span className="flex items-baseline justify-between gap-2 text-[13px] text-muted">
        <span>{list.length ? `${list.length} ${t.lotsWord}` : t.emptyBloc}</span>
        {billed && list.length > 0 && <b className="num text-ink">{percent(paid, expected)} %</b>}
      </span>
      {billed && list.length > 0 && (
        <span className="bar-stack bar-stack-sm">
          <span className="fill-paid" style={{ width: share("PAID") }} />
          <span className="fill-partial" style={{ width: share("PARTIAL") }} />
          <span className="fill-unpaid" style={{ width: share("UNPAID") }} />
        </span>
      )}
    </button>
  );
}
