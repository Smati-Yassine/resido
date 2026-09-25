import Link from "next/link";
import { loadWorkspace, tabFromPath } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatMoney, percent } from "@/lib/format";
import { loadProperty } from "@/lib/property/load";
import { EmptyState, PageHeader, StatCell } from "@/components/ui/Display";
import { ClosedBanner } from "@/components/workspace/CycleState";
import { AddLotButton, NewBlocButton } from "@/components/workspace/LotModals";
import { NewOwnerButton } from "@/components/workspace/OwnerModals";
import { LotsBoard } from "@/components/lots/LotsBoard";
import { OwnersBoard } from "@/components/owners/OwnersBoard";
import { PropertyOverview } from "@/components/property/PropertyOverview";
import { PrintLink } from "@/components/print/PrintLink";

const TABS = ["overview", "lots", "owners"] as const;
type Tab = (typeof TABS)[number];

/**
 * The residence's property, on one page like Finances: a strip of figures,
 * then the overview at /property, the lots at /property/lots and the owners
 * at /property/owners — all for the cycle on screen.
 */
export default async function PropertyPage({
  params,
  searchParams,
}: PageProps<"/residences/[residenceId]/property/[[...tab]]">) {
  const { session, residenceId, cycle, currency, can, href } = await loadWorkspace(params, searchParams);
  const tabHref = (key: Tab) => href(key === "overview" ? "/property" : `/property/${key}`);
  const tab = tabFromPath((await params).tab, TABS, (await searchParams).tab, tabHref);
  const { t } = await getDictionary();
  const data = await loadProperty(session, residenceId, cycle);
  const { figures } = data;
  const canLots = can("lots:*");
  const canOwners = can("owners:*");

  const labels: Record<Tab, string> = { overview: t.tabOverview, lots: t.lots, owners: t.owners };
  const counts: Record<Tab, number | null> = { overview: null, lots: figures.lots, owners: figures.owners };
  const lotActions = canLots && (
    <>
      <NewBlocButton residenceId={residenceId} />
      {data.blocs.length > 0 && (
        <AddLotButton residenceId={residenceId} blocs={data.blocs} owners={data.ownerOptions} />
      )}
    </>
  );
  const ownerAction = canOwners && <NewOwnerButton residenceId={residenceId} lots={data.choices} />;
  const print = cycle && figures.lots > 0 && <PrintLink href={href("/print/property")} label={t.print} />;

  return (
    <>
      {cycle && <ClosedBanner cycle={cycle} t={t} />}
      <PageHeader
        subtitle={interpolate(t.lotsSubtitle, { lots: figures.lots, blocs: figures.blocs })}
        title={t.navProperty}
        actions={
          <>
            {print}
            {tab !== "owners" && lotActions}
            {tab !== "lots" && ownerAction}
          </>
        }
      />

      {data.blocs.length === 0 ? (
        <EmptyState title={t.noBlocsTitle} text={t.noBlocsText} />
      ) : (
        <>
          <section className="card ledger" aria-label={t.navProperty}>
            <StatCell label={t.lots} value={String(figures.lots)} note={`${figures.blocs} ${t.blocsWord}`} />
            <StatCell
              label={t.owners}
              value={String(figures.owners)}
              note={figures.coOwned ? interpolate(t.coOwnedCount, { count: figures.coOwned }) : undefined}
            />
            <StatCell
              label={t.assignedLots}
              value={`${figures.assigned} / ${figures.lots}`}
              note={`${percent(figures.assigned, figures.lots)} %`}
            />
            {data.billed ? (
              <StatCell
                label={t.kpiOutstanding}
                value={formatMoney(figures.expectedMillimes - figures.collectedMillimes, currency)}
                valueClass="text-neg"
                note={interpolate(t.lotsConcerned, { count: figures.owing })}
              />
            ) : (
              <StatCell label={t.annualTotal} value={formatMoney(figures.expectedMillimes, currency)} />
            )}
          </section>

          <nav className="tabs" aria-label={t.navProperty}>
            {TABS.map((key) => (
              <Link key={key} href={tabHref(key)} className="tab" aria-current={key === tab ? "page" : undefined}>
                {labels[key]}
                {counts[key] !== null && <span className="tab-count">{counts[key]}</span>}
              </Link>
            ))}
          </nav>

          {cycle?.status === "DRAFT" && tab !== "owners" && <p className="text-muted">{t.noChargesDraft}</p>}
          {tab === "overview" && (
            <PropertyOverview
              t={t}
              currency={currency}
              data={data}
              hrefs={{ lots: tabHref("lots"), owners: tabHref("owners") }}
            />
          )}
          {tab === "lots" && (
            <LotsBoard
              items={data.lotItems}
              blocs={data.blocs}
              billed={data.billed}
              residenceId={residenceId}
              canEdit={canLots}
              owners={data.ownerOptions}
            />
          )}
          {tab === "owners" && (
            <OwnersBoard
              owners={data.ownerItems}
              unassigned={data.unassigned}
              billed={data.billed}
              residenceId={residenceId}
              canManage={canOwners}
              choices={data.choices}
            />
          )}
        </>
      )}
    </>
  );
}
