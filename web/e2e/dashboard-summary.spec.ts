import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

for (const width of [320, 390, 1440]) {
  test(`Dashboard summary and daily Category stacks at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByText("Looking good! No Categories need attention yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Budgets", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "About Category attention" }).click();
    await expect(page.getByRole("tooltip")).toContainText("Categories at 80% of their monthly Budget");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
    for (const [name, color, amount] of [["Daily Food", "teal", "60.00"], ["Daily Travel", "coral", "40.00"]]) {
      const response = await page.request.post(`${base}/categories`, { headers, data: { name, color } });
      expect(response.ok()).toBe(true);
      const category: unknown = await response.json();
      if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
      const budget = await page.request.put(`${base}/categories/${category.id}/budget`, { headers, data: { amount: "200.00", period: "monthly" } });
      expect(budget.ok()).toBe(true);
      const recorded = await page.request.post(`${base}/transactions`, { headers, data: { categoryId: category.id, amount, purchaseDate, description: `Synthetic ${name}` } });
      expect(recorded.ok()).toBe(true);
    }
    await page.clock.fastForward(31_000);
    const refreshNavigation = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" });
    await refreshNavigation.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
    await refreshNavigation.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByLabel("Reporting period", { exact: true }).fill(purchaseDate.slice(0, 7));
    const summary = page.getByRole("region", { name: "Monthly summary" });
    await expect(summary.getByText("Within Budget", { exact: true })).toBeVisible();
    await expect(summary).not.toContainText("remaining");
    const total = summary.getByText("Total spend", { exact: true }).locator("../..");
    const budget = summary.getByText("Spending vs Budget", { exact: true }).locator("../..");
    const totalBounds = await total.boundingBox();
    const budgetBounds = await budget.boundingBox();
    if (!totalBounds || !budgetBounds) throw new Error("Expected visible summary cards");
    expect(Math.abs(totalBounds.width - budgetBounds.width)).toBeLessThan(1);
    if (width < 768) expect(budgetBounds.y).toBeGreaterThan(totalBounds.y + totalBounds.height);
    else expect(budgetBounds.y).toBe(totalBounds.y);
    expect(await total.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await budget.evaluate(element => getComputedStyle(element).backgroundColor));

    const day = String(Number(purchaseDate.slice(-2)));
    const bar = page.getByRole("button", { name: `Day ${day}: ₱100.00` });
    await expect(bar.locator("span")).toHaveCount(2);
    await bar.hover();
    await expect(page.getByRole("status")).toContainText("₱100.00");
    await bar.click();
    await page.getByRole("heading", { name: "Daily spending" }).hover();
    await expect(page.getByRole("status")).toContainText("₱100.00");
    await page.getByRole("button", { name: "Dismiss chart details" }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View all transactions" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: test.info().outputPath(`dashboard-${width}.png`), fullPage: true });
  });
}
