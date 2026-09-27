import { expect, test } from "@playwright/test";
import { ADMIN, expectToast, unique } from "./helpers";

// Signed out: these tests start without the admin's session.
test.use({ storageState: { cookies: [], origins: [] } });

test("the residences are private: signed out, they lead to the sign-in page", async ({ page }) => {
  await page.goto("/residences");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Bon retour" })).toBeVisible();
});

test("a wrong password is refused, and says so", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[name=email]").fill(ADMIN.email);
  await page.locator("input[name=password]").fill("not-the-password");
  await page.locator("input[name=password]").press("Enter");
  await expectToast(page, "E-mail ou mot de passe incorrect.");
  await expect(page).toHaveURL(/\/$/);
});

test("creating an account opens an empty residences list", async ({ page }) => {
  const name = unique("Nouvelle Personne");
  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.locator("input[name=name]").fill(name);
  await page.locator("input[name=email]").fill(`${Date.now()}@e2e.test`);
  await page.locator("input[name=password]").fill("E2eTest123!");
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL(/\/residences$/);
  await expect(page.getByRole("heading", { name: `Bonjour, ${name.split(" ")[0]}` })).toBeVisible();
});

test("signing in opens the residences", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[name=email]").fill(ADMIN.email);
  await page.locator("input[name=password]").fill(ADMIN.password);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL(/\/residences$/);
  await expect(page.getByText("Résidence Démo").first()).toBeVisible();
});
