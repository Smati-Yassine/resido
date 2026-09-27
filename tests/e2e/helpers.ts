import { expect, type Page } from "@playwright/test";

/** The seeded account and residence (scripts/seed.ts). */
export const ADMIN = { email: "admin@resido.local", password: "ChangeMe123!" };
export const DEMO = "/residences/residence-demo";

/** A name no other test run has used. */
export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** The open modal (the topmost one). */
export const dialog = (page: Page) => page.getByRole("dialog").last();

/** Waits for a toast saying `text` (a substring, or any toast at all). */
export async function expectToast(page: Page, text?: string | RegExp) {
  const toast = page.locator(".toast-stack .toast");
  await expect(text ? toast.filter({ hasText: text }).first() : toast.first()).toBeVisible();
}

/** Signs in through the landing page's form. */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("input[name=password]").press("Enter");
  await page.waitForURL(/\/residences/);
}

/**
 * Nothing sticks out sideways: the page does not scroll horizontally, and no
 * element reaches past the right edge unless a box that scrolls or clips it on
 * purpose (a tab strip, a truncated cell) holds it in.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const offenders = await page.evaluate(() => {
    const width = window.innerWidth;
    const found: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) found.push(`page ${document.documentElement.scrollWidth}px`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const box = el.getBoundingClientRect();
      if (!box.width || box.right <= width + 1) continue;
      let held = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= width + 1) {
          held = true;
          break;
        }
      }
      if (!held) found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    }
    // Boxes that scroll sideways, other than the strips meant to (tabs, filter chips).
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.matches(".tabs, .segmented")) continue;
      const overflowX = getComputedStyle(el).overflowX;
      if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1)
        found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} scrolls sideways`);
    }
    return found.slice(0, 5);
  });
  expect(offenders, "elements wider than the screen").toEqual([]);
}
