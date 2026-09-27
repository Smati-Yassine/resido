import { expect, test, type Browser } from "@playwright/test";
import { DEMO, dialog, expectToast, unique } from "./helpers";

/** A new account, signed in in its own browser (the admin's session untouched). */
async function register(browser: Browser, email: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.locator("input[name=name]").fill(unique("Membre"));
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("E2eTest123!");
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL(/\/residences$/);
  return page;
}

test("a read-only member sees the residence and can change nothing", async ({ page, browser }) => {
  const email = `lecteur-${Date.now()}@e2e.test`;

  await test.step("the admin invites them as read-only", async () => {
    await page.goto(`${DEMO}/settings/members`);
    await page.getByRole("button", { name: /^Lecture seule/ }).click();
    await page.locator("input[name=email]").fill(email);
    await page.getByRole("button", { name: "Ajouter un membre", exact: true }).click();
    await expectToast(page);
    await expect(page.getByText(email)).toBeVisible();
  });

  const reader = await register(browser, email);

  await test.step("signing up, they find the residence waiting", async () => {
    await expect(reader.getByText("Résidence Démo").first()).toBeVisible();
  });

  await test.step("they see the money, without a single way to change it", async () => {
    await reader.goto(`${DEMO}/finances/payments`);
    await expect(reader.locator(".data-row").first()).toBeVisible();
    await expect(reader.getByRole("button", { name: "Nouvel encaissement" })).toHaveCount(0);
    await expect(reader.getByRole("button", { name: "Saisir une dépense" })).toHaveCount(0);
    await expect(reader.getByRole("button", { name: "Modifier le paiement" })).toHaveCount(0);
    await reader.goto(`${DEMO}/property/lots`);
    await expect(reader.locator(".data-row").first()).toBeVisible();
    await expect(reader.getByRole("button", { name: "Ajouter un lot" })).toHaveCount(0);
  });

  await reader.context().close();
});

test("nobody reaches a residence they are not a member of", async ({ page, browser }) => {
  const stranger = await register(browser, `voisin-${Date.now()}@e2e.test`);

  await test.step("a stranger cannot open the demo residence, nor its documents", async () => {
    // The page streams (its loading state goes first), so the answer is the 404 page, not the status.
    await stranger.goto(DEMO);
    await expect(stranger.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
    await expect(stranger.getByText("Commerce 1")).toHaveCount(0);
    const pdf = await stranger.request.get(`${DEMO}/print/report`);
    expect(pdf.status()).toBe(404);
    expect(pdf.headers()["content-type"]).not.toBe("application/pdf");
    const xlsx = await stranger.request.get(`${DEMO}/export/report`);
    expect(xlsx.status()).toBe(404);
  });

  await test.step("and the admin cannot open the stranger's own residence", async () => {
    await stranger.goto("/residences");
    await stranger.getByRole("button", { name: "Nouvelle résidence" }).click();
    await dialog(stranger).locator("input[name=name]").fill(unique("Chez le voisin"));
    await dialog(stranger).getByRole("button", { name: "Créer", exact: true }).click();
    await stranger.waitForURL(/\/residences\/[^/]+$/);
    const theirs = new URL(stranger.url()).pathname;

    await page.goto(theirs);
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  });

  await stranger.context().close();
});
