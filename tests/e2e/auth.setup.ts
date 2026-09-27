import { test as setup } from "@playwright/test";
import { ADMIN, signIn } from "./helpers";

/** Signs the seeded admin in once; the other tests start from that session. */
setup("sign in as the demo admin", async ({ page }) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  await page.context().storageState({ path: "tests/e2e/.auth/admin.json" });
});
