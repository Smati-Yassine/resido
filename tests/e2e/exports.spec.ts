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

test("every export is a workbook with the sheets it promises", async ({ request }) => {
  const expected: Record<string, string[]> = {
    property: ["Lots", "Propriétaires"],
    payments: ["Encaissements"],
    expenses: ["Dépenses"],
    unpaid: ["Impayés"],
    finances: ["Synthèse", "Par mois", "Mouvements"],
    report: ["Synthèse", "Lots", "Impayés", "Encaissements", "Dépenses", "Par mois", "Mouvements", "Propriétaires"],
  };
  for (const [doc, sheets] of Object.entries(expected)) {
    const book = await workbook(request, doc);
    expect(book.worksheets.map((s) => s.name), doc).toEqual(sheets);
    // Self-describing: the first line names the residence.
    expect(String(book.worksheets[0].getCell("A1").value)).toContain("Résidence Démo");
  }
});

test("the figures add up: lots, unpaid and the treasury's running balance", async ({ request }) => {
  const property = rows((await workbook(request, "property")).getWorksheet("Lots")!);
  const [header, ...body] = property;
  expect(header.slice(0, 8)).toEqual(["Bloc", "Lot", "Propriétaire(s)", "Téléphone(s)", "Charge", "Payé", "Reste", "Statut"]);
  const lots = body.slice(0, -1);
  const total = body[body.length - 1];
  expect(lots).toHaveLength(42); // the seeded residence
  expect(total[0]).toBe("Total");
  const sum = (i: number) => Math.round(lots.reduce((n, r) => n + Number(r[i] ?? 0), 0) * 1000) / 1000;
  expect(total[4]).toBeCloseTo(sum(4), 3);
  // Each lot: charge − paid = left to pay.
  for (const r of lots) expect(Number(r[4]) - Number(r[5])).toBeCloseTo(Number(r[6]), 3);

  // The unpaid list holds exactly the lots not fully paid, most owed first.
  const unpaid = rows((await workbook(request, "unpaid")).getWorksheet("Impayés")!).slice(1, -1);
  expect(unpaid).toHaveLength(lots.filter((r) => r[7] !== "Payé").length);
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
  expect(book.worksheets.map((s) => s.name)).toEqual([
    "Résidence",
    "Cycles",
    "Blocs",
    "Lots",
    "Propriétaires",
    "Charges",
    "Encaissements",
    "Répartition",
    "Dépenses",
    "Par mois",
    "Mouvements",
    "Par bloc",
    "Modes de paiement",
    "Membres",
    "Journal",
  ]);
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
