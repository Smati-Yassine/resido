import ExcelJS from "exceljs";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import type { Residence } from "@/lib/domain/residences/schema";
import type { PaymentMethod } from "@/lib/domain/payments/methods";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import * as ownersRepo from "@/lib/domain/owners/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import * as paymentsRepo from "@/lib/domain/payments/repository";
import * as expensesRepo from "@/lib/domain/expenses/repository";
import * as members from "@/lib/domain/members/service";
import { effectiveOwnerIds } from "@/lib/domain/assessments/schema";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { findUsersByIds } from "@/lib/domain/users/service";
import { listAuditLog } from "@/lib/audit/log";
import { describeAuditEntry } from "@/lib/audit/describe";
import { formatMonth } from "@/lib/format";
import { cycleRange } from "@/lib/cycle-view";
import { loadPrintData } from "@/lib/print/load";
import { C } from "@/lib/print/pdf/theme";
import { addReportSheets, PART_NAMES, REPORT_PARTS } from "./report-sheets";
import { addSummary, addTable, label as labelOf, stamp, units, type Cell } from "./sheets";
import {
  columnList,
  NO,
  ownerRef,
  RESIDENCE_COLUMNS,
  RESIDENCE_FORMAT,
  RESIDENCE_FORMAT_VERSION,
  RESIDENCE_LINES,
  RESIDENCE_SHEETS,
  rowOf,
  YES,
  type TableSheet,
} from "./residence-format";

/**
 * "The whole residence" as one workbook (docs/09-excel-exports.md). First,
 * every cycle's printed report, newest first, laid out as the PDF is
 * (lib/export/report-sheets.ts): its summary, the ledger by bloc with owners
 * and phones, the payments and the expenses month by month. Then, on grey
 * tabs, the records behind them — cycles, blocs, lots, owners, charges,
 * payments and how they were split, expenses — and the members and journal.
 * The record sheets are what an import rebuilds a residence from
 * (lib/import/residence-import.ts); owners are referred to by their "P…" ref
 * and payments by their number, so a file edited by hand still links up.
 */
export async function buildResidenceWorkbook(
  session: AuthorizedSession,
  residence: Residence,
  t: Dictionary,
  locale: Locale,
): Promise<Buffer> {
  const id = residence.id;
  const { currency } = residence;
  const fr = locale === "fr";
  const word = (code: string) => labelOf(code, locale);
  const yesNo = (value: boolean) => (value ? YES[locale] : NO[locale]);

  const [blocs, lots, owners, cyclesNewestFirst, treasuries, memberResult, journal] = await Promise.all([
    buildingsRepo.listBuildings(id),
    lotsRepo.listLots(id),
    ownersRepo.listOwners(id),
    cyclesRepo.listCycles(id),
    computeAllTreasuries(id),
    members.listMembers(session, id),
    listAuditLog(id, 10_000),
  ]);
  const cycles = [...cyclesNewestFirst].reverse();
  const perCycle = await Promise.all(
    cycles.map(async (cycle) => {
      const billed = cycle.status !== "DRAFT";
      const [assessments, payments, expenses] = await Promise.all([
        billed ? assessmentsRepo.listAssessmentsForCycle(id, cycle.id) : Promise.resolve([]),
        billed ? paymentsRepo.listPaymentsForCycle(id, cycle.id) : Promise.resolve([]),
        billed ? expensesRepo.listExpensesForCycle(id, cycle.id) : Promise.resolve([]),
      ]);
      return { cycle, billed, assessments, payments, expenses: [...expenses].sort(byDate) };
    }),
  );

  // Lookups and the refs the file links records by.
  const blocOrder = new Map(blocs.map((b, i) => [b.id, i]));
  const blocName = new Map(blocs.map((b) => [b.id, b.name]));
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const refOf = new Map(owners.map((o, i) => [o.id, ownerRef(i + 1)]));
  const cycleName = new Map(cycles.map((c) => [c.id, c.name]));
  const lotOrder = (a: string, b: string) => {
    const la = lotById.get(a);
    const lb = lotById.get(b);
    const ba = la?.buildingId ? (blocOrder.get(la.buildingId) ?? 0) : -1;
    const bb = lb?.buildingId ? (blocOrder.get(lb.buildingId) ?? 0) : -1;
    return ba - bb || (la?.code ?? "").localeCompare(lb?.code ?? "", "fr", { numeric: true });
  };
  const blocOf = (lotId: string) => {
    const bloc = lotById.get(lotId)?.buildingId;
    return bloc ? (blocName.get(bloc) ?? "") : "";
  };
  const codeOf = (lotId: string) => lotById.get(lotId)?.code ?? "?";
  const refs = (ids: string[]) => ids.map((o) => refOf.get(o) ?? "").filter(Boolean).join(", ");
  const names = (ids: string[]) => ids.map((o) => ownerById.get(o)?.name ?? "").filter(Boolean).join(" & ");

  // Every payment once (one can settle lots in two cycles), numbered oldest first.
  const payments = [...new Map(perCycle.flatMap((c) => c.payments).map((p) => [p.id, p])).values()].sort(byDate);
  const numberOf = new Map(payments.map((p, i) => [p.id, i + 1]));

  const caption = [
    `${residence.name} — ${t.docResidence}`,
    [residence.city, cycles.length ? `${cycles[0].name} → ${cycles[cycles.length - 1].name}` : ""]
      .filter(Boolean)
      .join(" · "),
    `${fr ? "Généré le" : "Generated on"} ${stamp(locale)} · Résido`,
  ].filter(Boolean);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Résido";
  workbook.created = new Date();
  const table = (sheet: TableSheet, rows: Cell[][], total?: string[]) => {
    const keys = Object.keys(RESIDENCE_COLUMNS[sheet]);
    addTable(workbook, {
      name: RESIDENCE_SHEETS[sheet][locale],
      caption,
      columns: columnList(sheet),
      rows,
      currency,
      locale,
      total: total?.map((k) => keys.indexOf(k)),
    });
  };

  /* ---------- Résidence ---------- */
  const billedCycles = perCycle.filter((c) => c.billed);
  addSummary(workbook, {
    name: RESIDENCE_SHEETS.residence[locale],
    caption,
    currency,
    lines: [
      { label: RESIDENCE_LINES.name.header[locale], value: residence.name, strong: true },
      { label: RESIDENCE_LINES.city.header[locale], value: residence.city },
      { label: RESIDENCE_LINES.currency.header[locale], value: currency },
      { label: RESIDENCE_LINES.status.header[locale], value: word(residence.status) },
      { label: "", value: null },
      { label: fr ? "Blocs" : "Blocks", value: blocs.length },
      { label: fr ? "Lots" : "Units", value: lots.length },
      { label: fr ? "Propriétaires" : "Owners", value: owners.filter((o) => !o.removed).length },
      { label: fr ? "Cycles" : "Cycles", value: cycles.length },
      { label: fr ? "Encaissements" : "Payments", value: payments.length },
      { label: fr ? "Dépenses" : "Expenses", value: billedCycles.reduce((n, c) => n + c.expenses.length, 0) },
      { label: "", value: null },
      { label: RESIDENCE_LINES.format.header[locale], value: `${RESIDENCE_FORMAT} v${RESIDENCE_FORMAT_VERSION}` },
      {
        label: fr ? "Onglets" : "Tabs",
        value: fr
          ? "Bleus : le rapport de chaque cycle, comme le PDF. Gris : les données, relues par l'import."
          : "Blue: each cycle's report, as the PDF. Grey: the data, read back by an import.",
      },
    ],
  });

  /* ---------- Each cycle's report, as printed from its dashboard ---------- */
  const generatedOn = stamp(locale);
  for (const cycle of cyclesNewestFirst) {
    const previous = cycles.find((c) => c.id === cycle.previousCycleId) ?? null;
    const data = await loadPrintData(session, id, cycle, previous);
    addReportSheets(
      workbook,
      {
        t,
        locale,
        currency,
        residence: { name: residence.name, city: residence.city },
        cycle: { name: cycle.name, status: cycle.status, range: cycleRange(cycle, t) },
        generatedOn,
      },
      data,
      REPORT_PARTS.report,
      (part) => `${cycle.name} — ${PART_NAMES[part][locale]}`,
    );
  }

  /* ---------- Cycles: each one's dashboard and treasury figures ---------- */
  table(
    "cycles",
    perCycle.map(({ cycle, billed, assessments }) => {
      const live = assessments.filter((a) => a.status !== "CANCELLED");
      const expected = live.reduce((n, a) => n + a.amountMillimes, 0);
      const collected = live.reduce((n, a) => n + a.paidMillimes, 0);
      const treasury = treasuries.get(cycle.id);
      const money = (millimes: number | undefined) => (billed && millimes !== undefined ? units(millimes) : null);
      return rowOf("cycles", {
        name: cycle.name,
        status: word(cycle.status),
        start: cycle.startDate,
        end: cycle.endDate,
        openingSource: billed && cycle.previousCycleId ? yesNo(!!treasury?.carriedFrom) : null,
        opening: money(treasury?.openingBalanceMillimes),
        expected: money(expected),
        collected: money(collected),
        outstanding: money(expected - collected),
        rate: billed ? (expected ? collected / expected : 0) : null,
        paidLots: billed ? live.filter((a) => a.status === "PAID").length : null,
        partialLots: billed ? live.filter((a) => a.status === "PARTIALLY_PAID").length : null,
        unpaidLots: billed ? live.filter((a) => a.status === "PENDING").length : null,
        expenses: money(treasury?.expenseMillimes),
        closing: money(treasury?.closingBalanceMillimes),
      });
    }),
  );

  /* ---------- Property: blocs, lots, owners as they are today ---------- */
  table(
    "blocs",
    blocs.map((b) => {
      const held = lots.filter((l) => l.buildingId === b.id);
      return rowOf("blocs", {
        name: b.name,
        lots: held.length,
        charges: units(held.reduce((n, l) => n + l.chargeMillimes, 0)),
      });
    }),
    ["lots", "charges"],
  );
  table(
    "lots",
    [...lots]
      .sort((a, b) => lotOrder(a.id, b.id))
      .map((l) =>
        rowOf("lots", {
          bloc: blocOf(l.id),
          code: l.code,
          charge: units(l.chargeMillimes),
          ownerRefs: refs(l.ownerIds),
          owners: names(l.ownerIds),
          phones: l.ownerIds
            .map((o) => ownerById.get(o)?.phone)
            .filter(Boolean)
            .join(" · "),
        }),
      ),
    ["charge"],
  );
  table(
    "owners",
    owners.map((o) => {
      const held = lots.filter((l) => l.ownerIds.includes(o.id)).sort((a, b) => lotOrder(a.id, b.id));
      return rowOf("owners", {
        ref: refOf.get(o.id),
        name: o.name,
        phone: o.phone ?? "",
        removed: o.removed ? YES[locale] : "",
        lots: held.map((l) => l.code).join(", "),
        lotCount: held.length,
      });
    }),
  );

  /* ---------- Charges: every lot of every cycle, who owned it, what it paid and how ---------- */
  table(
    "charges",
    perCycle.flatMap(({ cycle, assessments, payments: paid }) => {
      const methods = new Map<string, Set<PaymentMethod>>();
      for (const p of paid) {
        for (const a of p.allocations.filter((x) => x.cycleId === cycle.id)) {
          methods.set(a.assessmentId, (methods.get(a.assessmentId) ?? new Set()).add(p.method));
        }
      }
      return [...assessments]
        .sort((a, b) => lotOrder(a.lotId, b.lotId))
        .map((a) => {
          const ownerIds = effectiveOwnerIds(a, lotById.get(a.lotId)?.ownerIds ?? []);
          const status =
            a.status === "CANCELLED"
              ? "CANCELLED"
              : a.status === "PAID"
                ? "PAID"
                : a.status === "PARTIALLY_PAID"
                  ? "PARTIAL"
                  : "UNPAID";
          return rowOf("charges", {
            cycle: cycle.name,
            bloc: blocOf(a.lotId),
            lot: codeOf(a.lotId),
            ownerRefs: refs(ownerIds),
            owners: names(ownerIds),
            charge: units(a.amountMillimes),
            paid: units(a.paidMillimes),
            left: units(a.amountMillimes - a.paidMillimes),
            status: word(status),
            methods: [...(methods.get(a.id) ?? [])].map(word).join(", "),
          });
        });
    }),
    ["charge", "paid", "left"],
  );

  /* ---------- Finances: payments, how each was split, expenses ---------- */
  table(
    "payments",
    payments.map((p) =>
      rowOf("payments", {
        number: numberOf.get(p.id),
        date: p.date,
        cycles: [...new Set(p.allocations.map((a) => cycleName.get(a.cycleId) ?? ""))].join(", "),
        lots: [...p.allocations].sort((a, b) => lotOrder(a.lotId, b.lotId)).map((a) => codeOf(a.lotId)).join(", "),
        payer: p.payerName ?? "",
        payerRef: p.ownerId ? (refOf.get(p.ownerId) ?? "") : "",
        method: word(p.method),
        note: p.note ?? "",
        amount: units(p.amountMillimes),
      }),
    ),
    ["amount"],
  );
  table(
    "allocations",
    payments.flatMap((p) =>
      [...p.allocations]
        .sort((a, b) => lotOrder(a.lotId, b.lotId))
        .map((a) =>
          rowOf("allocations", {
            payment: numberOf.get(p.id),
            date: p.date,
            cycle: cycleName.get(a.cycleId) ?? "",
            lot: codeOf(a.lotId),
            amount: units(a.amountMillimes),
          }),
        ),
    ),
    ["amount"],
  );
  table(
    "expenses",
    perCycle.flatMap(({ cycle, expenses }) =>
      expenses.map((e) =>
        rowOf("expenses", {
          cycle: cycle.name,
          month: formatMonth(e.date.toISOString().slice(0, 7), locale),
          date: e.date,
          label: e.label,
          reference: e.reference ?? "",
          amount: units(e.amountMillimes),
        }),
      ),
    ),
    ["amount"],
  );

  /* ---------- Who has access, and what they did ---------- */
  table(
    "members",
    (memberResult.ok ? memberResult.data.members : []).map((m) =>
      rowOf("members", {
        name: m.name,
        email: m.email,
        role: m.isOwner ? t.roleCreator : ((t as Record<string, string>)[`role${m.role}`] ?? m.role),
        since: m.since,
      }),
    ),
  );
  const people = new Map(
    (await findUsersByIds([...new Set(journal.map((e) => e.actorUserId))])).map((u) => [u.id, u.name]),
  );
  table(
    "journal",
    journal.map((entry) =>
      rowOf("journal", {
        date: entry.createdAt,
        who: people.get(entry.actorUserId) ?? t.someone,
        what: (t as Record<string, string>)[`audit${entry.action}`] ?? entry.action,
        detail: describeAuditEntry(entry, t, currency),
      }),
    ),
  );
  // The journal's times matter, not only its days.
  const journalSheet = workbook.getWorksheet(RESIDENCE_SHEETS.journal[locale]);
  journalSheet?.getColumn(1).eachCell((cell) => {
    if (cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy hh:mm";
  });

  // The record sheets on grey tabs, after the reports.
  for (const [sheet, names] of Object.entries(RESIDENCE_SHEETS)) {
    if (sheet === "residence") continue;
    const tab = workbook.getWorksheet(names[locale]);
    if (tab) tab.properties.tabColor = { argb: `FF${C.stone.slice(1).toUpperCase()}` };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function byDate<T extends { date: Date }>(a: T, b: T) {
  return a.date.getTime() - b.date.getTime();
}
