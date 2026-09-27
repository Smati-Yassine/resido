import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import * as residences from "@/lib/domain/residences/service";
import * as owners from "@/lib/domain/owners/service";
import * as payments from "@/lib/domain/payments/service";
import * as expenses from "@/lib/domain/expenses/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as overview from "@/lib/domain/overview/service";
import { computeAllTreasuries } from "@/lib/domain/cycles/service";
import { buildResidenceWorkbook } from "@/lib/export/residence-workbook";
import { parseResidenceWorkbook, importResidence, type ImportPlan } from "@/lib/import/residence-import";
import { describeImportIssue } from "@/lib/import/describe";
import { adminSession, key, newUserId, residenceWithOpenCycle, setupTestDb, unwrap } from "./helpers";

setupTestDb();

/**
 * A residence with some history: a closed cycle with co-owned and partly
 * paid lots, a payment across two lots, an expense; an open cycle carrying
 * its balance over, paid into; and a draft cycle after it.
 */
async function residenceWithHistory() {
  const base = await residenceWithOpenCycle();
  const { session, residence, lots: l } = base;
  const id = residence.id;
  const ali = unwrap(await owners.createOwner(session, id, { name: "Ali Ben Salah", phone: "20 111 222", lotIds: [l.a11.id] }));
  unwrap(await owners.createOwner(session, id, { name: "Sonia Trabelsi", lotIds: [l.a11.id, l.b11.id], shareLotIds: [l.a11.id] }));
  unwrap(
    await payments.recordPayment(session, id, {
      ownerId: ali.id,
      payerName: "Ali Ben Salah",
      date: "2026-02-01",
      method: "CHECK",
      note: "chèque 12",
      idempotencyKey: key(),
      allocations: [
        { assessmentId: base.assessmentOf("A11"), amountMillimes: "1000" },
        { assessmentId: base.assessmentOf("A12"), amountMillimes: "250.500" },
      ],
    }),
  );
  unwrap(
    await expenses.recordExpense(session, id, {
      label: "Nettoyage",
      reference: "F-7",
      amountMillimes: "300.250",
      date: "2026-03-15",
      idempotencyKey: key(),
    }),
  );
  unwrap(await cycles.closeCycle(session, id, { cycleId: base.cycle.id }));

  const draft2 = unwrap(await cycles.createCycle(session, id, { name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" }));
  const second = unwrap(await cycles.openCycle(session, id, { cycleId: draft2.id }));
  const rows = await overview.getLotRows(session, id, second.id);
  unwrap(
    await payments.recordPayment(session, id, {
      payerName: "Locataire B11",
      date: "2027-01-10",
      method: "CASH",
      idempotencyKey: key(),
      allocations: [{ assessmentId: rows.find((r) => r.code === "B11")!.assessmentId, amountMillimes: "2000" }],
    }),
  );
  unwrap(await cycles.createCycle(session, id, { name: "2028", startDate: "2028-01-01" }));
  return base;
}

async function exportOf(residenceId: string, userId: string, locale: "fr" | "en" = "fr") {
  const session = adminSession(residenceId, userId);
  const residence = unwrap(await residences.getResidence(session, residenceId));
  return buildResidenceWorkbook(session, residence, DICTIONARIES[locale], locale);
}

async function planOf(file: Buffer): Promise<ImportPlan> {
  const parsed = await parseResidenceWorkbook(file);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.plan;
}

/** Edits a workbook in memory, then gives the file back. */
async function edit(file: Buffer, change: (book: ExcelJS.Workbook) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(file as unknown as Parameters<typeof book.xlsx.load>[0]);
  change(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Every cycle's treasury and billing, by cycle name — what the dashboards show. */
async function figures(residenceId: string, userId: string) {
  const session = adminSession(residenceId, userId);
  const treasuries = await computeAllTreasuries(residenceId);
  const list = unwrap(await cycles.listCycles(session, residenceId));
  return Object.fromEntries(
    await Promise.all(
      list.map(async (c) => {
        const { carriedFrom, ...treasury } = treasuries.get(c.id)!;
        const rows = c.status === "DRAFT" ? [] : await overview.getLotRows(session, residenceId, c.id);
        return [
          c.name,
          {
            status: c.status,
            carried: carriedFrom?.name ?? null,
            ...treasury,
            lots: rows.map((r) => `${r.code} ${r.ownerName ?? "-"} ${r.dueMillimes}/${r.paidMillimes} ${r.status}`),
          },
        ];
      }),
    ),
  );
}

describe("residence export and import", () => {
  it("round-trips: the imported residence shows the same figures, and exports the same file", async () => {
    const { residence, userId } = await residenceWithHistory();
    const file = await exportOf(residence.id, userId);

    const importer = newUserId();
    const result = await importResidence(importer, file);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.residence.name).toBe("Résidence Test");
    expect(result.residence.slug).not.toBe(residence.slug);
    expect(result.counts).toEqual({ blocs: 2, lots: 3, owners: 2, cycles: 3, payments: 2, expenses: 1 });

    // The importer owns the new residence; the original is untouched.
    expect((await residences.listResidenceCards(importer)).map((r) => r.name)).toEqual(["Résidence Test"]);
    expect(await figures(result.residence.id, importer)).toEqual(await figures(residence.id, userId));

    // Exported again (in English this time), the file reads back to the same records.
    const again = await exportOf(result.residence.id, importer, "en");
    expect(await planOf(again)).toEqual(await planOf(file));
  });

  it("carries a cycle's starting balance over, or keeps the typed one", async () => {
    const { residence, userId } = await residenceWithHistory();
    const plan = await planOf(await exportOf(residence.id, userId));
    expect(plan.cycles.map((c) => [c.name, c.status, c.carried])).toEqual([
      ["2026", "CLOSED", false],
      ["2027", "OPEN", true],
      ["2028", "DRAFT", false],
    ]);
    // 1250.500 collected − 300.250 spent in 2026.
    expect(plan.cycles[1].openingMillimes).toBe(950_250);
  });

  it("imports nothing from a file with problems, and says where they are", async () => {
    const { residence, userId } = await residenceWithHistory();
    const file = await exportOf(residence.id, userId);
    const broken = await edit(file, (book) => {
      const split = book.getWorksheet("Répartition")!;
      // The first allocation (N° 1, A11 in 2026): more than the lot's charge.
      split.eachRow((row) => {
        if (row.getCell(1).value === 1 && row.getCell(4).value === "A11") row.getCell(5).value = 5000;
      });
      const lots = book.getWorksheet("Lots")!;
      lots.eachRow((row) => {
        if (row.getCell(2).value === "A12") row.getCell(3).value = "beaucoup";
      });
    });
    const before = await residences.listResidenceCards(userId);

    const result = await importResidence(userId, broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const t = DICTIONARIES.fr;
    const messages = result.issues.map((i) => describeImportIssue(i, t, "fr"));
    expect(messages).toContainEqual(expect.stringMatching(/^Lots, ligne \d+ : « beaucoup » n’est pas un montant valide/));
    expect(messages).toContainEqual(expect.stringMatching(/Encaissements, ligne \d+ : le montant de l’encaissement N° 1/));
    expect(await residences.listResidenceCards(userId)).toEqual(before);
  });

  it("reports a wrong cell once, not again on every row that names its record", async () => {
    const { residence, userId } = await residenceWithHistory();
    const broken = await edit(await exportOf(residence.id, userId), (book) => {
      book.getWorksheet("Lots")!.eachRow((row) => {
        if (row.getCell(2).value === "A11") row.getCell(3).value = "?";
      });
      book.getWorksheet("Charges")!.eachRow((row) => {
        if (row.getCell(3).value === "A12") row.getCell(6).value = "-";
      });
    });
    const result = await parseResidenceWorkbook(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A11 is named by charges and payments, A12's charges by payments: none of those fail with them.
    expect(result.issues.map((i) => [i.sheet, i.code, i.value])).toEqual([
      ["Lots", "BAD_AMOUNT", "?"],
      ["Charges", "BAD_AMOUNT", "-"],
      ["Charges", "BAD_AMOUNT", "-"],
    ]);
  });

  it("reads a workbook filled in by hand: no refs, no split, English words", async () => {
    const book = new ExcelJS.Workbook();
    const add = (name: string, rows: unknown[][]) => {
      const ws = book.addWorksheet(name);
      rows.forEach((r) => ws.addRow(r));
    };
    add("Residence", [["Name", "Les Oliviers"], ["City", "Sousse"], ["Currency", "EUR"]]);
    add("Units", [["Block", "Unit", "Annual charge", "Owner(s)"], ["A", "A1", 1200, "Mme Karray"], ["A", "A2", "900,50", "Mme Karray & M. Karray"]]);
    add("Cycles", [["Cycle", "Status", "Start", "End", "Starting balance"], ["2026", "In progress", "01/01/2026", "31/12/2026", 150]]);
    add("Charges", [["Cycle", "Unit", "Charge"], ["2026", "A1", 1200], ["2026", "A2", 900.5]]);
    add("Payments", [["No.", "Date", "Cycle(s)", "Units", "Method", "Amount"], [1, "2026-02-03", "2026", "A1", "Bank transfer", 600]]);

    const importer = newUserId();
    const result = await importResidence(importer, Buffer.from(await book.xlsx.writeBuffer()), { name: "Oliviers (copie)" });
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.residence).toMatchObject({ name: "Oliviers (copie)", city: "Sousse", currency: "EUR" });
    expect(result.counts).toMatchObject({ blocs: 1, lots: 2, owners: 2, cycles: 1, payments: 1 });
    expect(await figures(result.residence.id, importer)).toEqual({
      "2026": {
        status: "OPEN",
        carried: null,
        openingBalanceMillimes: 150_000,
        incomeMillimes: 600_000,
        expenseMillimes: 0,
        closingBalanceMillimes: 750_000,
        lots: ["A1 Mme Karray 1200000/600000 PARTIAL", "A2 Mme Karray & M. Karray 900500/0 UNPAID"],
      },
    });
  });

  it("refuses what is not a workbook", async () => {
    const result = await parseResidenceWorkbook(Buffer.from("not a spreadsheet"));
    expect(result).toEqual({ ok: false, issues: [{ code: "NOT_A_WORKBOOK" }] });
  });
});
