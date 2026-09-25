import Link from "next/link";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { CurrencyCode } from "@/lib/currency";
import { formatAmount, percent } from "@/lib/format";
import type { PropertyData } from "@/lib/property/load";
import { Ring } from "@/components/dashboard/Charts";
import { Icon } from "@/components/ui/Icon";

/**
 * The Copropriété page's first tab: the blocs side by side, who owns what
 * (assigned, shared, the largest holders), the map of every lot, and the
 * lots still without an owner.
 */
export function PropertyOverview({
  t,
  currency,
  data,
  hrefs,
}: {
  t: Dictionary;
  currency: CurrencyCode;
  data: PropertyData;
  hrefs: { lots: string; owners: string };
}) {
  const { billed, blocSummaries, lotItems, ownerItems, unassigned, figures } = data;
  const money = (m: number) => formatAmount(m, currency);
  const assignedRate = percent(figures.assigned, figures.lots);
  const holders = [...ownerItems].sort((a, b) => b.lots.length - a.lots.length).slice(0, 5);
  const maxHeld = Math.max(1, ...holders.map((o) => o.lots.length));
  const sharedIds = new Set(lotItems.filter((l) => l.edit.ownerIds.length > 1).map((l) => l.id));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="card data-table xl:col-span-2">
          <div className="settings-group-head border-b border-line-soft">
            <h2 className="h-card">{t.blocs}</h2>
            <Link href={hrefs.lots} className="btn btn-link">
              {t.seeLots}
            </Link>
          </div>
          <div className="data-head grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.3fr)]">
            <span>{t.bloc}</span>
            <span className="text-right">{t.lots}</span>
            <span className="text-right">{t.owners}</span>
            <span className="text-right">{billed ? t.colCharge : t.annualTotal}</span>
            <span>{billed ? t.kpiRate : ""}</span>
          </div>
          {blocSummaries.map((b) => {
            const rate = percent(b.paidMillimes, b.chargeMillimes);
            const share = (n: number) => `${b.lotCount ? (n / b.lotCount) * 100 : 0}%`;
            return (
              <div
                key={b.id}
                className="data-row grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1.3fr)]"
              >
                <span className="flex min-w-0 items-center gap-2 font-bold">
                  <span className="text-primary">
                    <Icon name="bloc" size={16} />
                  </span>
                  <span className="truncate">{b.name}</span>
                </span>
                <span className="num text-right">{b.lotCount}</span>
                <span className="num text-right">{b.ownerCount}</span>
                <span className="num text-right">{money(b.chargeMillimes)}</span>
                {billed && b.lotCount > 0 ? (
                  <span className="flex items-center gap-2.5">
                    <span className="bar-stack bar-stack-sm flex-1">
                      <span className="fill-paid" style={{ width: share(b.status.PAID) }} />
                      <span className="fill-partial" style={{ width: share(b.status.PARTIAL) }} />
                      <span className="fill-unpaid" style={{ width: share(b.status.UNPAID) }} />
                    </span>
                    <b className="num w-10 text-right text-[13px]">{rate}%</b>
                  </span>
                ) : (
                  <span className="text-[13px] text-muted">{b.lotCount ? "" : t.emptyBloc}</span>
                )}
              </div>
            );
          })}
        </section>

        <section className="card card-pad flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="h-card">{t.owners}</h2>
            <Link href={hrefs.owners} className="btn btn-link">
              {t.seeOwners}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Ring value={assignedRate} />
            <dl className="flex flex-1 flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t.assignedLots}</dt>
                <dd className="num font-semibold">
                  {figures.assigned} / {figures.lots}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t.coOwnedLots}</dt>
                <dd className="num font-semibold">{figures.coOwned}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t.unassignedTitle}</dt>
                <dd className="num font-semibold">{unassigned.length}</dd>
              </div>
            </dl>
          </div>
          {holders.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
              <span className="text-[13px] font-bold text-muted">{t.topHolders}</span>
              {holders.map((o) => (
                <div key={o.id} className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold" title={o.name}>
                      {o.name}
                    </span>
                    <span className="num shrink-0 text-muted">
                      {interpolate(t.lotsCount, { count: o.lots.length })}
                    </span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${(o.lots.length / maxHeld) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card card-pad flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="h-card">{t.lotsMap}</h2>
            <p className="text-[13px] text-muted">{t.lotsMapHint}</p>
          </div>
          {billed && (
            <div className="flex gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-paid" />
                {t.paidPlural}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-partial" />
                {t.partialPlural}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="swatch fill-unpaid" />
                {t.unpaidPlural}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3.5">
          {blocSummaries
            .filter((b) => b.lotCount > 0)
            .map((b) => (
              <div key={b.id} className="flex flex-col gap-2">
                <span className="text-[13px] font-bold text-ink-2">{b.name}</span>
                <div className="lot-map">
                  {lotItems
                    .filter((l) => l.blocId === b.id)
                    .map((l) => (
                      <span
                        key={l.id}
                        className={`lot-tile ${sharedIds.has(l.id) ? "lot-tile-shared" : ""}`}
                        data-status={l.status ?? "NONE"}
                        title={interpolate(t.lotTileTitle, {
                          code: l.code,
                          owner: l.ownerName ?? t.noOwnerLabel,
                          amount: money(l.chargeMillimes - (l.paidMillimes ?? 0)),
                        })}
                      >
                        {l.code}
                        {sharedIds.has(l.id) && <Icon name="owners" size={11} />}
                      </span>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
