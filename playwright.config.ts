import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3310";
const baseURL = `http://localhost:${port}`;
const admin = "tests/e2e/.auth/admin.json";

/**
 * End-to-end tests (docs/11-testing-strategy.md): the real app on a seeded
 * in-memory database (tests/e2e/serve.mjs), driven in Chromium on a desktop
 * and on a phone. The tests share that database, so they run one at a time.
 *
 *   npm run test:e2e           against `next dev`
 *   npm run test:e2e:prod      against a production build
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/e2e/serve.mjs",
    url: `${baseURL}/api/version`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { E2E_PORT: port },
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: admin },
      dependencies: ["setup"],
      testIgnore: [/mobile\.spec\.ts/, /\.setup\.ts/],
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], storageState: admin },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
