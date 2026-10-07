import { expect, test } from "@playwright/test";
import { createNewLocalTestUser, requireEnvironment } from "./test-helpers";
import { navigateSpending } from "./theme-helpers";

test("navigation and financial routes fit responsive boundary widths", async ({ page }) => {
  await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
  await page.goto("/");
  await createNewLocalTestUser(page);
  for (const width of [320, 767, 768, 1023, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [destination, heading] of [
      ["Transactions", "Your spending"], ["Budgets", "Budget overview"],
      ["Insights", "Insights"], ["Imports", "Upload your statement"],
      ["Sharing", "Invite someone you trust"],
    ] as const) {
      await navigateSpending(page, destination);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), {
        message: `${destination} and navigation must fit at ${width}px`,
      }).toBe(true);
      if (width < 768) await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      if (width >= 1024) await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    }
  }
});
