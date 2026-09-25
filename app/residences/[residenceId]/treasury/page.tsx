import { loadWorkspace } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/format";
import { computeCycleTreasury } from "@/lib/domain/cycles/service";
import { Notice, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, NoCycle } from "@/components/workspace/CycleState";
import { OpeningBalanceForm } from "@/components/workspace/OpeningBalanceForm";

export default async function TreasuryPage({ params, searchParams }: PageProps<"/residences/[residenceId]/treasury">) {
  const { residenceId, cycle, currency, can, base } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;

  const header = <PageHeader subtitle={t.treasurySubtitle} title={t.treasury} />;
  if (cycle.status === "DRAFT") {
    return (
      <>
        {header}
        <p className="text-muted">{t.treasuryDraft}</p>
      </>
    );
  }
  const treasury = await computeCycleTreasury(residenceId, cycle);
  const operator = "hidden text-center font-display text-[34px] text-stone min-[1320px]:block";

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      {header}
      <div className="card grid grid-cols-1 items-center gap-6 rounded-[20px] p-8 sm:grid-cols-2 min-[1320px]:grid-cols-[minmax(0,1.25fr)_40px_minmax(0,1fr)_40px_minmax(0,1fr)_40px_minmax(0,1.2fr)] min-[1320px]:gap-2 min-[1320px]:p-10">
        <div className="flex flex-col gap-2">
          <label htmlFor="start-balance" className="label-caps text-[13px]">
            {t.startBalance}
          </label>
          {cycle.status === "OPEN" && can("treasury:*") ? (
            <OpeningBalanceForm
              key={treasury.openingBalanceMillimes}
              residenceId={residenceId}
              cycleId={cycle.id}
              openingMillimes={treasury.openingBalanceMillimes}
            />
          ) : (
            <>
              <span className="num text-[26px] font-bold">
                {formatMoney(treasury.openingBalanceMillimes, currency)}
              </span>
              <span className="text-xs text-muted">{t.startLockedNote}</span>
            </>
          )}
        </div>
        <span className={operator}>+</span>
        <div className="flex flex-col gap-2">
          <span className="label-caps text-[13px]">{t.income}</span>
          <span className="num text-pos text-[26px] font-bold">{formatMoney(treasury.incomeMillimes, currency)}</span>
          <span className="text-xs text-muted">{t.incomeNote}</span>
        </div>
        <span className={operator}>−</span>
        <div className="flex flex-col gap-2">
          <span className="label-caps text-[13px]">{t.expenses}</span>
          <span className="num text-neg text-[26px] font-bold">{formatMoney(treasury.expenseMillimes, currency)}</span>
          <span className="text-xs text-muted">{t.expenseNote}</span>
        </div>
        <span className={operator}>=</span>
        <div className="card-night flex flex-col gap-2 rounded-[14px] p-6">
          <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-night-soft">
            {cycle.status === "CLOSED" ? t.closingBalance : t.currentBalance}
          </span>
          <span className="num font-display text-[36px]">{formatMoney(treasury.closingBalanceMillimes, currency)}</span>
          <span className="text-xs text-night-soft">{currencySymbol(currency)}</span>
        </div>
      </div>
      <Notice icon="infoCircle">{t.treasuryNote}</Notice>
    </>
  );
}
