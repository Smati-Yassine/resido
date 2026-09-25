import Link from "next/link";
import { loadWorkspace } from "@/lib/workspace";
import { getDictionary } from "@/lib/i18n/server";
import { cycleRange } from "@/lib/cycle-view";
import { paymentLots } from "@/lib/lot-rows";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { getExpenseMonths, getLotRows, totalsFromLotRows } from "@/lib/domain/overview/service";
import { incomeByMethod, incomeInCycle, monthlyFlows } from "@/lib/domain/overview/finance";
import * as payments from "@/lib/domain/payments/service";
import { PageHeader } from "@/components/ui/Display";
import { ClosedBanner, DraftCycle, NoCycle } from "@/components/workspace/CycleState";
import { PaymentButton } from "@/components/workspace/PaymentModal";
import { ExpenseButton } from "@/components/workspace/ExpenseModal";
import { TreasuryLedger } from "@/components/finances/TreasuryLedger";
import { FinanceOverview, type Movement } from "@/components/finances/FinanceOverview";
import { PaymentsTable } from "@/components/finances/PaymentsTable";
import { ExpensesTable } from "@/components/finances/ExpensesTable";

const TABS = ["overview", "payments", "expenses"] as const;
type Tab = (typeof TABS)[number];

/** Payments, expenses and the treasury they add up to, on one page: an overview tab, then one tab per list. */
export default async function FinancesPage({ params, searchParams }: PageProps<"/residences/[residenceId]/finances">) {
  const { session, residenceId, cycle, cycles, currency, can, base } = await loadWorkspace(params, searchParams);
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";
  const { t, locale } = await getDictionary();
  if (!cycle) return <NoCycle residenceId={residenceId} base={base} t={t} canCreate={can("cycles:manage")} />;
  if (cycle.status === "DRAFT") return <DraftCycle base={base} cycle={cycle} t={t} />;

  const [rows, paymentResult, months, treasuries] = await Promise.all([
    getLotRows(session, residenceId, cycle.id),
    payments.listPaymentsForCycle(session, residenceId, cycle.id),
    getExpenseMonths(session, residenceId, cycle.id),
    computeAllTreasuries(residenceId),
  ]);
  const treasury = treasuries.get(cycle.id)!;
  const previous = cycles.find((c) => c.id === cycle.previousCycleId);
  const paymentList = paymentResult.ok ? paymentResult.data : [];
  const expenses = months.flatMap((m) => m.items);
  const lots = paymentLots(rows);
  const tabHref = (key: Tab) => `${base}/finances?${key === "overview" ? "" : `tab=${key}&`}cycle=${cycle.id}`;

  const codeOf = new Map(rows.map((r) => [r.assessmentId, r.code]));
  const movements: Movement[] = [
    ...paymentList.map((p) => ({
      id: p.id,
      kind: "in" as const,
      label: p.allocations
        .filter((a) => a.cycleId === cycle.id)
        .map((a) => codeOf.get(a.assessmentId) ?? "?")
        .join(", "),
      detail: p.payerName ?? t[`method${p.method}`],
      date: p.date,
      amountMillimes: incomeInCycle(p, cycle.id),
    })),
    ...expenses.map((e) => ({
      id: e.id,
      kind: "out" as const,
      label: e.label,
      detail: e.reference ?? "",
      date: e.date,
      amountMillimes: e.amountMillimes,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 6);

  const counts: Record<Tab, number | null> = {
    overview: null,
    payments: paymentList.length,
    expenses: expenses.length,
  };
  const tabLabel: Record<Tab, string> = {
    overview: t.tabOverview,
    payments: t.payments,
    expenses: t.expenses,
  };

  return (
    <>
      <ClosedBanner cycle={cycle} t={t} />
      <PageHeader
        subtitle={cycleRange(cycle, t)}
        title={t.finances}
        // A closed cycle stays correctable, so the buttons stay too.
        actions={
          <>
            {can("expenses:create") && <ExpenseButton residenceId={residenceId} variant="ghost" />}
            {can("payments:create") && <PaymentButton residenceId={residenceId} lots={lots} />}
          </>
        }
      />
      <TreasuryLedger
        t={t}
        currency={currency}
        treasury={treasury}
        closed={cycle.status === "CLOSED"}
        edit={
          can("treasury:*")
            ? {
                residenceId,
                cycleId: cycle.id,
                previous: previous
                  ? {
                      name: previous.name,
                      closingMillimes: treasuries.get(previous.id)?.closingBalanceMillimes ?? 0,
                    }
                  : null,
              }
            : null
        }
      />
      <nav className="tabs" aria-label={t.finances}>
        {TABS.map((key) => (
          <Link key={key} href={tabHref(key)} className="tab" aria-current={key === tab ? "page" : undefined}>
            {tabLabel[key]}
            {counts[key] !== null && <span className="tab-count">{counts[key]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <FinanceOverview
          t={t}
          locale={locale}
          currency={currency}
          flows={monthlyFlows(paymentList, expenses, cycle.id, treasury.openingBalanceMillimes)}
          methods={incomeByMethod(paymentList, cycle.id)}
          openingMillimes={treasury.openingBalanceMillimes}
          totals={totalsFromLotRows(rows)}
          topExpenses={[...expenses].sort((a, b) => b.amountMillimes - a.amountMillimes).slice(0, 5)}
          movements={movements}
          hrefs={{
            payments: tabHref("payments"),
            expenses: tabHref("expenses"),
            lots: `${base}/lots?cycle=${cycle.id}`,
          }}
        />
      )}
      {tab === "payments" && (
        <PaymentsTable
          t={t}
          currency={currency}
          residenceId={residenceId}
          cycleId={cycle.id}
          payments={paymentList}
          rows={rows}
          lots={lots}
          canChange={can("payments:cancel")}
        />
      )}
      {tab === "expenses" && (
        <ExpensesTable
          t={t}
          locale={locale}
          currency={currency}
          residenceId={residenceId}
          months={months}
          canChange={can("expenses:cancel")}
        />
      )}
    </>
  );
}
