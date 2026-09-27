import { expect, test } from "@playwright/test";
import { DEMO, dialog, expectNoHorizontalOverflow } from "./helpers";

/** Runs on a phone (the "phone" project in playwright.config.ts). */

const PAGES = [
  "/residences",
  DEMO,
  `${DEMO}/finances`,
  `${DEMO}/finances/payments`,
  `${DEMO}/finances/expenses`,
  `${DEMO}/property`,
  `${DEMO}/property/lots`,
  `${DEMO}/property/owners`,
  `${DEMO}/settings`,
  `${DEMO}/settings/cycles`,
  `${DEMO}/settings/members`,
  `${DEMO}/settings/journal`,
];

test("every page fits the phone's width", async ({ page }) => {
  for (const path of PAGES) {
    await test.step(path, async () => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
    });
  }
});

test("the tab bar replaces the sidebar and leads to every section", async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator(".side")).toBeHidden();
  const tabbar = page.getByRole("navigation", { name: "Sections de la résidence" }).locator("visible=true");
  for (const [name, url] of [
    ["Finances", /\/finances/],
    ["Copropriété", /\/property/],
    ["Paramètres", /\/settings/],
    ["Tableau de bord", /residence-demo$/],
  ] as const) {
    await tabbar.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
    await expect(tabbar.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
});

test("a modal is a sheet from the bottom, and a picked lot still fits", async ({ page }) => {
  await page.goto(`${DEMO}/finances/payments`);
  await page.getByRole("button", { name: "Nouvel encaissement" }).click();
  const sheet = dialog(page);
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // done rising
  const box = (await sheet.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(Math.round(box.y + box.height)).toBe(height); // resting on the bottom edge

  const search = sheet.locator("input[type=search]");
  await search.fill("Commerce 1");
  await search.press("Enter");
  await expect(sheet.locator(".input-group input")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("the top bar's menus open as sheets and close on a tap outside", async ({ page }) => {
  await page.goto(DEMO);
  await page.getByRole("button", { name: "Changer de cycle" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toContainText("Cycle 2026");
  await page.locator(".menu-backdrop").click({ position: { x: 20, y: 200 } });
  await expect(menu).toBeHidden();
});

test("offline, a full screen says so; back online, retry lifts it", async ({ page, context }) => {
  await page.goto(DEMO);
  await page.waitForLoadState("networkidle"); // the app is listening
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const screen = page.getByRole("alertdialog", { name: "Pas de connexion" });
  await expect(screen).toBeVisible();
  await context.setOffline(false);
  // The app checks on its own too, and may beat the tap: either way the screen goes.
  await screen
    .getByRole("button", { name: "Réessayer" })
    .click({ timeout: 3000 })
    .catch(() => {});
  await expect(screen).toBeHidden();
});

test("print hands the PDF to the phone's share menu", async ({ page }) => {
  // The browser under test has no share menu: record what it would receive.
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: { name: string; type: string; head: string } };
    navigator.canShare = (data) => !!data?.files?.length;
    navigator.share = async (data) => {
      const file = data!.files![0];
      w.shared = { name: file.name, type: file.type, head: await file.slice(0, 5).text() };
    };
  });
  await page.goto(`${DEMO}/finances/payments`);
  await page.locator(".page-actions").getByRole("button", { name: "Imprimer" }).click();
  const sheet = dialog(page);
  await sheet.getByRole("button", { name: "Imprimer ou partager" }).click();
  const shared = await page.waitForFunction(() => (window as unknown as { shared?: object }).shared);
  expect(await shared.jsonValue()).toMatchObject({ type: "application/pdf", head: "%PDF-" });
  await expect(sheet).toBeHidden();
});

test("the residences page offers to install the app", async ({ page }) => {
  await page.goto("/residences");
  await page.waitForLoadState("networkidle"); // the app is listening
  // Chrome's install offer only comes over HTTPS: make it here.
  await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(offer);
  });
  const card = page.getByRole("region", { name: "Installer l’app Résido" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Installer" }).click();
  await expect(card).toBeHidden();
});
