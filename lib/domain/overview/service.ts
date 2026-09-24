import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import type { AssessmentStatus } from "@/lib/domain/assessments/schema";
import type { Cycle } from "@/lib/domain/cycles/schema";
import type { Expense } from "@/lib/domain/expenses/schema";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as expensesRepo from "@/lib/domain/expenses/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";
import { computeCycleTreasury, type CycleTreasury } from "@/lib/domain/cycles/service";

/**
 * Read models for the residence workspace. Every figure is derived from the
 * same assessments, payments and expenses the rest of the app writes — never
 * a separately maintained counter (docs/00-product-overview.md §5).
 */

export type LotPaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

export interface LotRow {
  lotId: string;
  assessmentId: string;
  code: string;
  blocId: string | null;
  blocName: string;
  ownerId: string | null;
  ownerName: string | null;
  dueMillimes: number;
  paidMillimes: number;
  status: LotPaymentStatus;
}

function toLotStatus(status: AssessmentStatus): LotPaymentStatus {
  if (status === "PAID") return "PAID";
  if (status === "PARTIALLY_PAID") return "PARTIAL";
  return "UNPAID";
}

/** One row per lot billed in the cycle, ordered by bloc (creation order) then lot code. */
export async function getLotRows(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<LotRow[]> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:read");

  const [assessments, lots, blocs, owners] = await Promise.all([
    assessmentsRepo.listAssessmentsForCycle(organizationId, cycleId),
    lotsRepo.listLots(organizationId),
    buildingsRepo.listBuildings(organizationId),
    ownersRepo.listOwners(organizationId),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const blocIndex = new Map(blocs.map((b, i) => [b.id, i]));
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));

  return assessments
    .filter((a) => a.status !== "CANCELLED")
    .map((a): LotRow => {
      const lot = lotById.get(a.lotId);
      const blocId = lot?.buildingId ?? null;
      const ownerId = lot?.ownerId ?? null;
      return {
        lotId: a.lotId,
        assessmentId: a.id,
        code: lot?.code ?? "?",
        blocId,
        blocName: blocId ? (blocName.get(blocId) ?? "") : "",
        ownerId,
        ownerName: ownerId ? (ownerName.get(ownerId) ?? null) : null,
        dueMillimes: a.amountMillimes,
        paidMillimes: a.paidMillimes,
        status: toLotStatus(a.status),
      };
    })
    .sort((x, y) => {
      const bx = x.blocId ? (blocIndex.get(x.blocId) ?? 0) : -1;
      const by = y.blocId ? (blocIndex.get(y.blocId) ?? 0) : -1;
      return bx - by || x.code.localeCompare(y.code, "fr", { numeric: true });
    });
}

export interface ExpenseMonth {
  /** "YYYY-MM" — formatted for display by the UI in the viewer's language. */
  month: string;
  totalMillimes: number;
  items: Expense[];
}

/** Expenses grouped by calendar month, oldest first — the layout of the source ledger. */
export function groupExpensesByMonth(expenses: Expense[]): ExpenseMonth[] {
  const byMonth = new Map<string, ExpenseMonth>();
  for (const expense of expenses) {
    const month = expense.date.toISOString().slice(0, 7);
    const group = byMonth.get(month) ?? { month, totalMillimes: 0, items: [] };
    group.totalMillimes += expense.amountMillimes;
    group.items.push(expense);
    byMonth.set(month, group);
  }
  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getExpenseMonths(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<ExpenseMonth[]> {
  requireOrganization(session, organizationId);
  requirePermission(session, "expenses:read");
  return groupExpensesByMonth(await expensesRepo.listExpensesForCycle(organizationId, cycleId));
}

export interface CycleTotals {
  expectedMillimes: number;
  collectedMillimes: number;
  outstandingMillimes: number;
  lotCount: number;
  paid: number;
  partial: number;
  unpaid: number;
}

export function totalsFromLotRows(rows: LotRow[]): CycleTotals {
  const totals: CycleTotals = {
    expectedMillimes: 0,
    collectedMillimes: 0,
    outstandingMillimes: 0,
    lotCount: rows.length,
    paid: 0,
    partial: 0,
    unpaid: 0,
  };
  for (const row of rows) {
    totals.expectedMillimes += row.dueMillimes;
    totals.collectedMillimes += row.paidMillimes;
    if (row.status === "PAID") totals.paid += 1;
    else if (row.status === "PARTIAL") totals.partial += 1;
    else totals.unpaid += 1;
  }
  totals.outstandingMillimes = totals.expectedMillimes - totals.collectedMillimes;
  return totals;
}

export interface BlocProgress {
  blocId: string | null;
  name: string;
  lotCount: number;
  paidCount: number;
  expectedMillimes: number;
  collectedMillimes: number;
}

export function progressByBloc(rows: LotRow[]): BlocProgress[] {
  const byBloc = new Map<string, BlocProgress>();
  for (const row of rows) {
    const key = row.blocId ?? "";
    const entry = byBloc.get(key) ?? {
      blocId: row.blocId,
      name: row.blocName,
      lotCount: 0,
      paidCount: 0,
      expectedMillimes: 0,
      collectedMillimes: 0,
    };
    entry.lotCount += 1;
    if (row.status === "PAID") entry.paidCount += 1;
    entry.expectedMillimes += row.dueMillimes;
    entry.collectedMillimes += row.paidMillimes;
    byBloc.set(key, entry);
  }
  return Array.from(byBloc.values());
}

export interface CycleOverview {
  totals: CycleTotals;
  blocs: BlocProgress[];
  treasury: CycleTreasury;
  expenseMonths: ExpenseMonth[];
}

/** Everything the dashboard shows for one cycle. */
export async function getCycleOverview(
  session: AuthorizedSession,
  organizationId: string,
  cycle: Cycle,
): Promise<CycleOverview> {
  requireOrganization(session, organizationId);
  requirePermission(session, "treasury:read");

  const [rows, treasury, expenseMonths] = await Promise.all([
    getLotRows(session, organizationId, cycle.id),
    computeCycleTreasury(organizationId, cycle),
    getExpenseMonths(session, organizationId, cycle.id),
  ]);
  return { totals: totalsFromLotRows(rows), blocs: progressByBloc(rows), treasury, expenseMonths };
}
