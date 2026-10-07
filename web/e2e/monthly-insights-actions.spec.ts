import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

for (const width of [320, 390, 1440]) {
  test(`Monthly Insights preserves investigation and Budget context at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByText(/No Categories need attention yet/)).toBeVisible();
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
    await page.getByText("Inspect monthly spending", { exact: true }).click();
    const inspect = page.getByRole("button", { name: "Inspect Sep 2026", exact: true });
    await inspect.click();
    const details = page.getByRole("dialog");
    await expect(details.getByText(/Over Budget · ₱0.01 over/)).toHaveCount(1);
    await details.getByRole("button", { name: "View Synthetic risk month’s Transactions" }).click();
    await expect(page).toHaveURL(new RegExp("categoryId=" + category.id));
    await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Transaction summary" }).getByText("₱1,000.01", { exact: true })).toBeVisible();
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await page.getByRole("button", { name: "Return to Insights" }).click();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue(date.slice(0, 7));
    await expect(inspect).toBeFocused();
    await inspect.click();
    await details.getByRole("button", { name: "Edit Synthetic risk Budget" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Synthetic risk" });
    await expect(dialog.getByText(/Saving a new limit also changes historical comparisons/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(inspect).toBeFocused();
    await inspect.click();
    await details.getByRole("button", { name: "Edit Synthetic risk Budget" }).click();
    await dialog.getByRole("textbox", { name: "Monthly Budget for Synthetic risk" }).fill("1200.00");
    await dialog.getByRole("button", { name: /Save/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(inspect).toBeFocused();
    await inspect.click();
    await expect(details.getByText(/Nearing Budget · ₱199.99 remaining/)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await page.getByText("Inspect monthly spending", { exact: true }).click();
    await page.getByRole("button", { name: "Inspect Aug 2026", exact: true }).click();
    await expect(details).toContainText("Total: ₱500.00");
    await expect(details).toContainText("Within Budget · ₱700.00 remaining");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
