import { expect, test } from "@playwright/test";
import { DEMO, dialog, expectToast } from "./helpers";

/** On the demo residence's open cycle: a partial payment, corrected, then deleted. */
test("a partial payment can be recorded, corrected and deleted", async ({ page }) => {
  await page.goto(`${DEMO}/finances/payments`);
  const rows = page.locator(".data-row");
  const before = await rows.count();
  const ours = rows.filter({ hasText: "Commerce 1 (partiel)" });

  await test.step("record 100 of what Commerce 1 owes", async () => {
    await page.getByRole("button", { name: "Nouvel encaissement" }).click();
    const search = dialog(page).locator("input[type=search]");
    await search.fill("Commerce 1");
    await search.press("Enter");
    await dialog(page).locator(".input-group input").fill("100");
    await dialog(page).locator("textarea[name=note]").fill("Acompte E2E");
    await dialog(page).getByRole("button", { name: "Enregistrer le paiement" }).click();
    await expectToast(page);
    await expect(rows).toHaveCount(before + 1);
    await expect(ours).toContainText("100.000");
    await expect(ours).toContainText("Acompte E2E");
  });

  await test.step("correct its note", async () => {
    await ours.getByRole("button", { name: "Modifier le paiement" }).click();
    await dialog(page).locator("textarea[name=note]").fill("Acompte corrigé");
    await dialog(page).getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expectToast(page);
    await expect(ours).toContainText("Acompte corrigé");
  });

  await test.step("delete it", async () => {
    await ours.getByRole("button", { name: "Supprimer le paiement" }).click();
    await dialog(page).getByRole("button", { name: "Supprimer le paiement" }).click();
    await expectToast(page);
    await expect(rows).toHaveCount(before);
  });
});

/** An expense of the open cycle, recorded and then deleted. */
test("an expense can be recorded and deleted", async ({ page }) => {
  await page.goto(`${DEMO}/finances/expenses`);
  const ours = page.locator(".data-row").filter({ hasText: "Peinture E2E" });

  await page.getByRole("button", { name: "Saisir une dépense" }).click();
  await dialog(page).locator("input[name=label]").fill("Peinture E2E");
  await dialog(page).locator("input[name=amount]").fill("320");
  await dialog(page).getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expectToast(page);
  await expect(ours).toContainText("320.000");

  await ours.getByRole("button", { name: "Supprimer la dépense" }).click();
  await dialog(page).getByRole("button", { name: "Supprimer la dépense" }).click();
  await expectToast(page);
  await expect(ours).toHaveCount(0);
});
