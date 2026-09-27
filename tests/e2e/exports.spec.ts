import ExcelJS from "exceljs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { DEMO } from "./helpers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Downloads one export of the demo residence's current cycle and opens it. */
async function workbook(request: APIRequestContext, doc: string) {
  const response = await request.get(`${DEMO}/export/${doc}`);
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
