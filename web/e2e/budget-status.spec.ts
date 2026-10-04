import { expect, test } from "@playwright/test";

import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

for (const width of [390, 1440]) {
  test(`exact monthly Budget status and spending scope at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByText(/No Categories need attention yet/)).toBeVisible();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
    await page.getByLabel("Reporting period", { exact: true }).fill(purchaseDate.slice(0, 7));
    const navigation = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" });
    const refreshDashboard = async () => {
      await page.clock.fastForward(31_000);
      await navigation.getByRole("link", { name: "Transactions", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
      await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    };
    for (const [name, amount, budget, period] of [
      ["Yearly only", "50.00", "1200.00", "yearly"],
      ["Below threshold", "799.99", "1000.00", "monthly"],
      ["Threshold", "800.00", "1000.00", "monthly"],
      ["Below limit", "999.99", "1000.00", "monthly"],
      ["At limit", "1000.00", "1000.00", "monthly"],
      ["Breach", "1000.01", "1000.00", "monthly"],
      ["Unused cushion", null, "95000.00", "monthly"],
    ] as const) {
      const created = await page.request.post(`${base}/categories`, { headers, data: { name } });
      expect(created.ok()).toBe(true);
      const category: unknown = await created.json();
      if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
      const saved = await page.request.put(`${base}/categories/${category.id}/budget`, { headers, data: { amount: budget, period } });
      expect(saved.ok()).toBe(true);
      if (amount !== null) {
        const recorded = await page.request.post(`${base}/transactions`, { headers, data: { categoryId: category.id, amount, purchaseDate, description: `Synthetic ${name}` } });
        expect(recorded.ok()).toBe(true);
      }
      if (period === "yearly") {
        await refreshDashboard();
        await expect(page.getByText("No Budgets", { exact: true })).toBeVisible();
        await expect(page.getByText("Add a monthly Budget to track progress", { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Monthly summary" }).getByText("₱50.00", { exact: true })).toHaveCount(2);
      }
    }
    const uncategorized = await page.request.post(`${base}/transactions`, { headers, data: { categoryId: null, amount: "25.00", purchaseDate, description: "Synthetic Uncategorized" } });
    expect(uncategorized.ok()).toBe(true);
    await refreshDashboard();
    const summary = page.getByRole("region", { name: "Monthly summary" });
    await expect(summary.getByText("4.6%", { exact: true })).toBeVisible();
    await expect(summary.getByText("₱4,674.99", { exact: true })).toBeVisible();
    await expect(summary.getByText("₱75.00", { exact: true })).toBeVisible();
    const attention = page.getByRole("region", { name: "Category attention" });
    await expect(attention.getByRole("link", { name: /Below threshold/ })).toHaveCount(0);
    await expect(attention.getByRole("link", { name: /Below limit.*Nearing Budget.*₱0.01 left/ })).toBeVisible();
    await expect(attention.getByRole("link", { name: /At limit.*At Budget Limit.*₱0.00 remaining/ })).toBeVisible();
    await expect(attention.getByRole("link", { name: /Breach.*Over Budget.*₱0.01 over/ })).toBeVisible();
    await page.getByRole("button", { name: "Manage Budgets", exact: true }).click();
    const categories = width < 768 ? page.getByRole("list", { name: /Budget Categories/i }) : page.getByRole("table", { name: "Desktop Budget Categories" });
    await expect(categories.getByText("Within Budget · ₱200.01 remaining", { exact: true })).toBeVisible();
    await expect(categories.getByText("At Budget Limit · ₱0.00 remaining", { exact: true })).toBeVisible();
    await expect(categories.getByText("Over Budget · ₱0.01 over", { exact: true })).toBeVisible();
    await navigation.getByRole("link", { name: "Insights", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    const dailyView = page.getByRole("button", { name: "Daily view", exact: true });
    await (await dailyView.count() > 0 ? dailyView : page.getByRole("button", { name: "Monthly view", exact: true })).click();
    await expect(page.getByText("Over Budget · ₱0.01 over", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
