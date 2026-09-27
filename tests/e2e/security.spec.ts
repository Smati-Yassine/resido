import { expect, test } from "@playwright/test";
import { expectToast, unique } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("after five wrong passwords, even the right one waits", async ({ page }) => {
  const email = `essais-${Date.now()}@e2e.test`;
  const password = "E2eTest123!";

  // A fresh account, signed out again: this test must not lock the demo admin.
  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.locator("input[name=name]").fill(unique("Essais"));
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL(/\/residences$/);
  await page.context().clearCookies();

  const attempt = async (value: string) => {
    await page.goto("/");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(value);
    await page.locator("input[name=password]").press("Enter");
  };
  for (let i = 0; i < 5; i++) {
    await attempt(`wrong-${i}`);
    await expectToast(page, "E-mail ou mot de passe incorrect.");
  }
  await attempt(password);
  await expectToast(page, "Trop d’essais. Réessayez dans 15 minutes.");
  await expect(page).toHaveURL(/\/$/);
});

test("pages refuse to be framed and keep their types", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
