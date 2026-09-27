import { expect, test } from "@playwright/test";
import { dialog, expectToast, unique } from "./helpers";

/** "1 200.000" however the thousands are spaced. */
const amount = (text: string) => new RegExp(text.replace(" ", "\\s?").replace(".", "\\."));

/**
 * The whole life of a residence, as a syndic goes through it: create it, add a
 * bloc and a lot, create and open a cycle, collect a payment, record an
 * expense, check the figures and the PDF, close the cycle.
 */
test("a residence from nothing to a closed cycle", async ({ page }) => {
  let base = "";

  await test.step("create the residence", async () => {
    await page.goto("/residences");
    await page.getByRole("button", { name: "Nouvelle résidence" }).click();
    await dialog(page).locator("input[name=name]").fill(unique("Résidence E2E"));
    await dialog(page).locator("input[name=city]").fill("Sousse");
    await dialog(page).getByRole("button", { name: "Créer", exact: true }).click();
    await page.waitForURL(/\/residences\/[^/]+$/);
    base = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  });

  await test.step("add a bloc and a lot", async () => {
    await page.goto(`${base}/property/lots`);
    await page.getByRole("button", { name: "Nouveau bloc" }).click();
    await dialog(page).locator("input[name=name]").fill("Bloc T");
    await dialog(page).getByRole("button", { name: "Créer le bloc" }).click();
    await expectToast(page);
    await expect(dialog(page)).toBeHidden();

    await page.locator(".page-actions").getByRole("button", { name: "Ajouter un lot" }).click();
    await dialog(page).locator("input[name=code]").fill("T1");
    await dialog(page).locator("input[name=charge]").fill("1200");
    await dialog(page).getByRole("button", { name: "Ajouter un lot" }).click();
    await expectToast(page);
    await expect(page.locator(".data-row").filter({ hasText: "T1" })).toBeVisible();
  });

  await test.step("create the first cycle and open it", async () => {
    await page.goto(`${base}/settings/cycles`);
    await page.getByRole("button", { name: "Nouveau cycle" }).click();
    await dialog(page).locator("input[name=name]").fill("Cycle E2E");
    await dialog(page).getByRole("button", { name: "Créer le cycle" }).click();
    await expectToast(page);
    const row = page.locator(".data-row").filter({ hasText: "Cycle E2E" });
    await row.getByRole("button", { name: "Actions du cycle" }).click();
    await page.getByRole("menuitem", { name: "Ouvrir le cycle" }).click();
    await expectToast(page, "Cycle E2E ouvert");
    // Opened, the cycle bills the lot its annual charge.
    await page.goto(base);
    const expected = page.locator(".kpi").filter({ hasText: "Charges appelées" });
    await expect(expected).toContainText(amount("1 200.000"));
  });

  await test.step("collect the lot's payment", async () => {
    await page.getByRole("button", { name: "Encaisser un paiement" }).click();
    const search = dialog(page).locator("input[type=search]");
    await search.fill("T1");
    await search.press("Enter"); // adds the best match, its whole balance
    await expect(dialog(page).getByRole("button", { name: "T1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog(page).getByRole("button", { name: "Enregistrer le paiement" }).click();
    await expectToast(page);

    await page.goto(`${base}/finances/payments`);
    const row = page.locator(".data-row").filter({ hasText: "T1" });
    await expect(row).toContainText(amount("1 200.000"));
    await page.goto(`${base}/property/lots`);
    await expect(page.locator(".data-row").filter({ hasText: "T1" })).toContainText("Payé");
  });

  await test.step("record an expense", async () => {
    await page.goto(`${base}/finances`);
    await page.getByRole("button", { name: "Saisir une dépense" }).click();
    await dialog(page).locator("input[name=label]").fill("Ampoules");
    await dialog(page).locator("input[name=amount]").fill("45.5");
    await dialog(page).getByRole("button", { name: "Enregistrer la dépense" }).click();
    await expectToast(page);
    // The treasury: nothing at the start, 1 200 in, 45.5 out.
    await expect(page.locator(".ledger-total")).toContainText(amount("1 154.500"));
    await page.goto(`${base}/finances/expenses`);
    await expect(page.locator(".data-row").filter({ hasText: "Ampoules" })).toContainText("45.500");
  });

  await test.step("print the cycle report", async () => {
    const response = await page.request.get(`${base}/print/report`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  await test.step("close the cycle", async () => {
    await page.goto(`${base}/settings/cycles`);
    const row = page.locator(".data-row").filter({ hasText: "Cycle E2E" });
    await row.getByRole("button", { name: "Actions du cycle" }).click();
    await page.getByRole("menuitem", { name: "Clôturer maintenant" }).click();
    await dialog(page).getByRole("button", { name: "Clôturer maintenant" }).click();
    await expectToast(page);
    await expect(row).toContainText("Clôturé");
  });

  await test.step("reopen it, a correction to make", async () => {
    const row = page.locator(".data-row").filter({ hasText: "Cycle E2E" });
    await row.getByRole("button", { name: "Actions du cycle" }).click();
    await page.getByRole("menuitem", { name: "Rouvrir" }).click();
    await expectToast(page, "Cycle E2E rouvert");
    await expect(row).toContainText("En cours");
  });
});
