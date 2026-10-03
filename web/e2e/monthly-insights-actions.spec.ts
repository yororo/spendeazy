import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

for (const width of [320, 390, 1440]) {
  test(`Monthly Insights preserves investigation and Budget context at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByText(/No spending recorded in this Reporting Period/)).toBeVisible();
    const headers = authorizationHeaders(token);
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const date = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
    const created = await page.request.post(`${base}/categories`, { headers, data: { name: "Synthetic risk" } });
    expect(created.ok()).toBe(true);
    const category: unknown = await created.json();
    if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
    expect((await page.request.put(`${base}/categories/${category.id}/budget`, { headers, data: { amount: "1000.00", period: "monthly" } })).ok()).toBe(true);
    for (const [amount, purchaseDate] of [["1000.01", date], ["500.00", "2026-08-10"]]) {
      expect((await page.request.post(`${base}/transactions`, { headers, data: { categoryId: category.id, amount, purchaseDate, description: "Synthetic monthly investigation" } })).ok()).toBe(true);
    }
    await page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" }).getByRole("link", { name: "Insights", exact: true }).click();
    await page.getByLabel("Reporting period", { exact: true }).fill(date.slice(0, 7));
    const summary = page.getByRole("region", { name: "Selected-month recorded spending" });
    await expect(summary.getByText(/Over Budget · ₱0.01 over/)).toHaveCount(1);
    await expect(summary.getByText(/Elapsed month: 63%/)).toBeVisible();
    expect(await summary.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector('[aria-label="Month comparison"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    const explorer = page.getByRole("region", { name: "Category explorer" });
    await explorer.getByRole("button", { name: "Review Synthetic risk: Over Budget", exact: true }).click();
    await expect(explorer.getByText(/Over Budget · ₱0.01 over/)).toBeVisible();
    const view = explorer.getByRole("button", { name: "View Synthetic risk Transactions" });
    await view.click();
    await expect(page).toHaveURL(new RegExp(`categoryId=${category.id}`));
    await expect(page.getByRole("button", { name: "Active Space: Personal" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Transaction summary" }).getByText("₱1,000.01", { exact: true })).toBeVisible();
    if (width < 768) await page.getByRole("button", { name: "Filter Transactions, filters active", exact: true }).click();
    await page.getByLabel("Category", { exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("option", { name: "All Categories", exact: true }).click();
    if (width < 768) await page.getByRole("button", { name: "Close navigation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Return to Insights" })).toBeVisible();
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await page.getByRole("button", { name: "Return to Insights" }).click();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue(date.slice(0, 7));
    await expect(view).toBeFocused();
    const edit = explorer.getByRole("button", { name: "Edit Synthetic risk Budget" });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "Edit Synthetic risk" });
    await expect(dialog.getByText(/Saving a new limit also changes historical comparisons/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(edit).toBeFocused();
    await edit.click();
    await dialog.getByRole("textbox", { name: "Monthly Budget for Synthetic risk" }).fill("1200.00");
    await dialog.getByRole("button", { name: /Save/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(summary.getByText(/Nearing Budget · ₱199.99 remaining/)).toHaveCount(1);
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await expect(summary.getByText("Actual historical recorded spending. Comparisons use current monthly limits.")).toBeVisible();
    await expect(summary.getByText(/Elapsed month/)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
