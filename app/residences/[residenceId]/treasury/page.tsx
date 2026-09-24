import { loadWorkspace } from "@/lib/workspace";
import { currencySymbol } from "@/lib/currency";
import { getDictionary } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/format";
import { computeCycleTreasury } from "@/lib/domain/cycles/service";
import { Notice, PageHeader } from "@/components/ui/Display";
import { ClosedBanner, NoCycle } from "@/components/workspace/CycleState";
import { OpeningBalanceForm } from "@/components/workspace/OpeningBalanceForm";

export default async function TreasuryPage({ params, searchParams }: PageProps<"/residences/[residenceId]/treasury">) {
  const { residenceId, cycle, currency, can } = await loadWorkspace(params, searchParams);
  const { t } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} t={t} canCreate={can("cycles:manage")} />;

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
  const operator = "text-center font-display text-[34px] text-stone";

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      {header}
      <div className="card grid grid-cols-[1.25fr_40px_1fr_40px_1fr_40px_1.2fr] items-center gap-2 rounded-[20px] p-10">
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
