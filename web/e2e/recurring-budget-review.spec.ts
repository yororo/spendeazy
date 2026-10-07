import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

test("monthly inspection Budget editing survives cancel and stale failure, then recalculates historical comparisons", async ({ page }) => {
  await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  const headers = authorizationHeaders(await createNewLocalTestUser(page));
  await expect(page.getByText(/No Categories need attention yet/)).toBeVisible();
  const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
  const response = await page.request.post(`${base}/categories`, { headers, data: { name: "Synthetic recurring" } });
  expect(response.ok()).toBe(true);
  const category: unknown = await response.json();
  if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
  const budgetUrl = `${base}/categories/${category.id}/budget`;
  expect((await page.request.put(budgetUrl, { headers, data: { amount: "1000.00", period: "monthly" } })).ok()).toBe(true);
  for (const [purchaseDate, amount] of [["2024-01-10", "1000.01"], ["2025-02-10", "1100.00"], ["2026-03-10", "1200.00"], ["2026-05-10", "1000.00"], ["2026-06-10", "900.00"], ["2026-08-10", "800.00"], ["2026-09-10", "2000.00"]]) {
    expect((await page.request.post(`${base}/transactions`, { headers, data: { categoryId: category.id, purchaseDate, amount, description: "Synthetic recurring expense" } })).ok()).toBe(true);
  }
  for (const yearly of [false, true]) {
    const name = yearly ? "Synthetic yearly history" : "Synthetic unbudgeted history";
    const created = await page.request.post(`${base}/categories`, { headers, data: { name } });
    expect(created.ok()).toBe(true);
    const item: unknown = await created.json();
    if (!isRecord(item) || typeof item.id !== "string") throw new Error("Expected Category ID");
    if (yearly) expect((await page.request.put(`${base}/categories/${item.id}/budget`, { headers, data: { amount: "12000.00", period: "yearly" } })).ok()).toBe(true);
    expect((await page.request.post(`${base}/transactions`, { headers, data: { categoryId: item.id, purchaseDate: "2026-03-10", amount: "100.00", description: "Synthetic no monthly Budget" } })).ok()).toBe(true);
  }
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Insights", exact: true }).click();
  await page.getByLabel("Reporting period", { exact: true }).fill("2026-09");
  await expect(page.getByRole("region", { name: "Recurring Budget review" })).toHaveCount(0);
  await page.getByText("Inspect monthly spending", { exact: true }).click();
  const inspect = page.getByRole("button", { name: "Inspect Sep 2026", exact: true });
  const details = page.getByRole("dialog");
  const review = async () => {
    await inspect.click();
    await details.getByRole("button", { name: "Edit Synthetic recurring Budget" }).click();
  };
  await review();
  const dialog = page.getByRole("dialog", { name: "Edit Synthetic recurring" });
  await expect(dialog.getByText(/Saving a new limit also changes historical comparisons/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(inspect).toBeFocused();
  await review();
  const input = dialog.getByRole("textbox", { name: "Monthly Budget for Synthetic recurring" });
  await expect(input).toHaveValue("1000.00");
  const currentBudget = await page.request.get(budgetUrl, { headers });
  expect(currentBudget.ok()).toBe(true);
  const current: unknown = await currentBudget.json();
  if (!isRecord(current) || typeof current.updatedAt !== "string") throw new Error("Expected Budget version");
  expect((await page.request.put(budgetUrl, { headers, data: { amount: "1100.00", period: "monthly", updatedAt: current.updatedAt } })).ok()).toBe(true);
  await input.fill("1500.00");
  await dialog.getByRole("button", { name: /Save/ }).click();
  await expect(dialog.getByText(/changed|stale|another/i)).toBeVisible();
  await expect(input).toHaveValue("1500.00");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await review();
  await expect(input).toHaveValue("1100.00");
  await input.fill("1500.00");
  await dialog.getByRole("button", { name: /Save/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(inspect).toBeFocused();
  await inspect.click();
  await expect(details).toContainText("Over Budget · ₱500.00 over");
  await page.keyboard.press("Escape");
  await page.getByLabel("Reporting period", { exact: true }).fill("2026-03");
  await page.getByText("Inspect monthly spending", { exact: true }).click();
  await page.getByRole("button", { name: "Inspect Mar 2026", exact: true }).click();
  await expect(details).toContainText("Nearing Budget · ₱300.00 remaining");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  for (const yearly of [false, true]) {
    const name = yearly ? "Synthetic yearly history" : "Synthetic unbudgeted history";
    await page.getByRole("button", { name: "Inspect Mar 2026", exact: true }).click();
    const set = details.getByRole("button", { name: "Set " + name + " Budget", exact: true });
    await set.click();
    const editor = page.getByRole("dialog", { name: "Edit " + name });
    if (yearly) {
      await expect(editor.getByText("Yearly Budget is preserved; monthly editing is unavailable.")).toBeVisible();
      await expect(editor.getByRole("textbox", { name: "Monthly Budget for " + name })).toHaveCount(0);
      await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    } else {
      await editor.getByRole("textbox", { name: "Monthly Budget for " + name }).fill("500.00");
      await editor.getByRole("button", { name: /Save/ }).click();
      await expect(editor).toHaveCount(0);
      await page.getByRole("button", { name: "Inspect Mar 2026", exact: true }).click();
      await expect(details).toContainText("Within Budget · ₱400.00 remaining");
      await page.keyboard.press("Escape");
    }
  }
});
