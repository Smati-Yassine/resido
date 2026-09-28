import ExcelJS from "exceljs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { DEMO, dialog, expectToast, unique } from "./helpers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Downloads one export of a residence (the demo one) — its current cycle's, or `all` — and opens it. */
async function workbook(request: APIRequestContext, doc: string, residence = DEMO) {
  const response = await request.get(`${residence}/export/${doc}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe(XLSX);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.xlsx"$/);
  const book = new ExcelJS.Workbook();
  // ExcelJS's types predate Node's generic Buffer.
  await book.xlsx.load((await response.body()) as unknown as Parameters<typeof book.xlsx.load>[0]);
  return book;
}

/** A sheet's table as rows of values, from its header row down (the captions skipped). */
function rows(sheet: ExcelJS.Worksheet) {
  const all: unknown[][] = [];
  sheet.eachRow((row) => all.push((row.values as unknown[]).slice(1)));
  const header = all.findIndex((r) => r.length > 2);
  return all.slice(header);
}

/**
 * A cell's number, whether written as one or worked out by a formula. The
 * file holds a formula's result even when it is 0, but ExcelJS reads a 0 back
 * as no result at all.
 */
const num = (value: unknown) =>
  Number(value && typeof value === "object" && "formula" in value ? ((value as { result?: unknown }).result ?? 0) : value);

/**
 * A printed-report ledger (Copropriété): its lot lines — those with a charge
 * of their own, not a bloc's band or subtotal — and its total line.
 */
function ledger(sheet: ExcelJS.Worksheet) {
  const [header, ...body] = rows(sheet);
  return {
    header,
    lots: body.filter((r) => typeof r[3] === "number"),
    total: body[body.length - 1],
    subtotals: body.filter((r) => r[0] === "Sous-total"),
  };
}

test("every export is a workbook with the sheets it promises", async ({ request }) => {
  const expected: Record<string, string[]> = {
    property: ["Copropriété"],
    payments: ["Encaissements"],
    expenses: ["Dépenses"],
    unpaid: ["Impayés"],
    finances: ["Synthèse", "Par mois", "Mouvements"],
    report: ["Synthèse", "Copropriété", "Encaissements", "Dépenses"],
  };
  for (const [doc, sheets] of Object.entries(expected)) {
    const book = await workbook(request, doc);
    expect(book.worksheets.map((s) => s.name), doc).toEqual(sheets);
    // Self-describing: the first line names the residence.
    expect(String(book.worksheets[0].getCell("A1").value)).toContain("Résidence Démo");
  }
});

test("the figures add up: the ledger, unpaid and the treasury's running balance", async ({ request }) => {
  // The ledger as the PDF prints it: lots by bloc, a subtotal per bloc, then the total.
  const { header, lots, total, subtotals } = ledger((await workbook(request, "property")).getWorksheet("Copropriété")!);
  expect(header.slice(0, 7)).toEqual(["LOT", "PROPRIÉTAIRES", "TÉLÉPHONE", "CHARGE", "PAYÉ", "RESTE", "STATUT"]);
  expect(lots).toHaveLength(42); // the seeded residence
  expect(subtotals.length).toBeGreaterThan(1);
  expect(total[0]).toBe("Total général");
  const sum = (list: unknown[][], i: number) => Math.round(list.reduce((n, r) => n + num(r[i] ?? 0), 0) * 1000) / 1000;
  // The total counts each lot once, not the subtotals again.
  for (const i of [3, 4, 5]) {
    expect(num(total[i])).toBeCloseTo(sum(lots, i), 3);
    expect(num(total[i])).toBeCloseTo(sum(subtotals, i), 3);
  }
  // Each lot: charge − paid = left to pay.
  for (const r of lots) expect(num(r[3]) - num(r[4])).toBeCloseTo(num(r[5]), 3);

  // The unpaid list holds exactly the lots not fully paid, most owed first.
  const unpaid = rows((await workbook(request, "unpaid")).getWorksheet("Impayés")!).slice(1, -1);
  expect(unpaid).toHaveLength(lots.filter((r) => r[6] !== "Payé").length);
  const owed = unpaid.map((r) => Number(r[6]));
  expect(owed).toEqual([...owed].sort((a, b) => b - a));

  // The movements' last balance is the treasury's balance in the summary.
  const finances = await workbook(request, "finances");
  const moves = rows(finances.getWorksheet("Mouvements")!).slice(1, -1);
  const summary = finances.getWorksheet("Synthèse")!;
  let balance: unknown;
  summary.eachRow((row) => {
    if (row.getCell(1).value === "= Solde") balance = row.getCell(2).value;
  });
  expect(Number(moves[moves.length - 1][6])).toBeCloseTo(Number(balance), 3);
});

test("the Excel menu downloads this page's export", async ({ page }) => {
  await page.goto(`${DEMO}/finances/payments`);
  await page.getByRole("button", { name: "Exporter en Excel" }).click();
  const menu = page.getByRole("menu", { name: "Exporter en Excel" });
  await expect(menu.getByRole("menuitem").first()).toHaveText("Encaissements");
  const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("menuitem").first().click()]);
  expect(download.suggestedFilename()).toMatch(/^encaissements-.+\.xlsx$/);
});

test("the whole residence: every sheet, and a file that imports back as a new residence", async ({ request }) => {
  const book = await workbook(request, "all");
  const report = (cycle: string) => ["Synthèse", "Copropriété", "Encaissements", "Dépenses"].map((s) => `${cycle} — ${s}`);
  expect(book.worksheets.map((s) => s.name)).toEqual([
    "Résidence",
    ...report("Cycle 2026"),
    ...report("Cycle 2025"),
    "Cycles",
    "Blocs",
    "Lots",
    "Propriétaires",
    "Charges",
    "Encaissements",
    "Répartition",
    "Dépenses",
    "Membres",
    "Journal",
  ]);
  // Each cycle's ledger bills what its line in Cycles says.
  const cycles = rows(book.getWorksheet("Cycles")!).slice(1);
  for (const cycle of ["Cycle 2026", "Cycle 2025"]) {
    const { total } = ledger(book.getWorksheet(`${cycle} — Copropriété`)!);
    expect(num(total[3]), cycle).toBeCloseTo(num(cycles.find((r) => r[0] === cycle)![6]), 3);
  }
  const file = Buffer.from(await book.xlsx.writeBuffer());

  const name = unique("Import démo");
  const response = await request.post("/api/imports/residence", {
    multipart: { file: { name: "demo.xlsx", mimeType: XLSX, buffer: file }, name },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ ok: true });
  expect(result.message).toContain(name);

  // The copy bills, collects and spends exactly what the original does, cycle by cycle.
  const figures = async (base: string) =>
    rows((await workbook(request, "all", base)).getWorksheet("Cycles")!)
      .slice(1)
      .map((r) => [r[0], r[1], ...r.slice(4)]);
  expect(await figures(`/residences/${result.slug}`)).toEqual(await figures(DEMO));
});

test("a broken file imports nothing and says what to fix", async ({ request }) => {
  const book = await workbook(request, "all");
  // The first lot, under the header: an annual charge that is no amount.
  const lots = book.getWorksheet("Lots")!;
  let first = 0;
  lots.eachRow((row) => {
    if (!first && row.getCell(2).value === "Lot") first = row.number + 1;
  });
  lots.getRow(first).getCell(3).value = "beaucoup";
  const response = await request.post("/api/imports/residence", {
    multipart: { file: { name: "demo.xlsx", mimeType: XLSX, buffer: Buffer.from(await book.xlsx.writeBuffer()) } },
  });
  expect(response.status()).toBe(422);
  const result = await response.json();
  expect(result.ok).toBe(false);
  expect(result.issues).toContainEqual(`Lots, ligne ${first} : « beaucoup » n’est pas un montant valide (Charge annuelle).`);
});

test("Import on the residences list opens the new residence", async ({ page, request }) => {
  const file = Buffer.from(await (await workbook(request, "all")).xlsx.writeBuffer());
  await page.goto("/residences");
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  const modal = dialog(page);
  await modal.getByLabel("Classeur Excel (.xlsx)").setInputFiles({ name: "demo.xlsx", mimeType: XLSX, buffer: file });
  const name = unique("Import modal");
  await modal.getByLabel("Nom de la nouvelle résidence").fill(name);
  await modal.getByRole("button", { name: "Importer" }).click();
  await expectToast(page, name);
  await page.waitForURL(/\/residences\/import-modal-/);
});

test("the Excel menu and the settings export the whole residence", async ({ page }) => {
  await page.goto(DEMO);
  await page.getByRole("button", { name: "Exporter en Excel" }).click();
  const menu = page.getByRole("menu", { name: "Exporter en Excel" });
  const [fromMenu] = await Promise.all([
    page.waitForEvent("download"),
    menu.getByRole("menuitem", { name: /Toute la résidence/ }).click(),
  ]);
  expect(fromMenu.suggestedFilename()).toMatch(/^residence-demo-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.goto(`${DEMO}/settings`);
  const [fromSettings] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exporter (.xlsx)" }).click(),
  ]);
  expect(fromSettings.suggestedFilename()).toBe(fromMenu.suggestedFilename());
});
