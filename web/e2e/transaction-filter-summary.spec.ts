import { expect, test } from "@playwright/test";

import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

test("filtered Transaction summaries cover every page and clear together", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const token = await createNewLocalTestUser(page);
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
  const headers = authorizationHeaders(token);
  const spacesResponse = await page.request.get(`${base}/spaces`, { headers });
  const spaces: unknown = await spacesResponse.json();
  if (!Array.isArray(spaces) || !isRecord(spaces[0]) || typeof spaces[0].id !== "string") throw new Error("Expected Personal Space");

  const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
  const categoryResponse = await page.request.post(`${base}/categories`, { headers, data: { name: "Synthetic filtered expenses" } });
  expect(categoryResponse.ok(), await categoryResponse.text()).toBe(true);
  const category: unknown = await categoryResponse.json();
  if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
  // Independent rows belong to this fresh User; cap outstanding writes at five.
  for (let start = 0; start < 101; start += 5) {
    const responses = await Promise.all(Array.from({ length: Math.min(5, 101 - start) }, (_, offset) =>
      page.request.post(`${base}/transactions`, { headers, data: {
        categoryId: category.id, purchaseDate, description: `Synthetic coffee ${start + offset}`, amount: "1.25",
      } }),
    ));
    for (const response of responses) expect(response.ok()).toBe(true);
  }
  const other = await page.request.post(`${base}/transactions`, { headers, data: { purchaseDate, description: "Synthetic other expense", amount: "50.00" } });
  expect(other.ok()).toBe(true);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Transactions", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).first().click();
  await page.getByRole("option", { name: "Synthetic filtered expenses", exact: true }).click();
  await page.getByLabel("Reporting period", { exact: true }).fill(purchaseDate.slice(0, 7));
  const summary = page.getByRole("region", { name: "Transaction summary" });
  await expect(summary.getByText("101", { exact: true })).toBeVisible();
  await expect(summary.getByText("₱126.25", { exact: true })).toBeVisible();
  await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
  await expect(summary.getByText("₱0.00", { exact: true })).toBeVisible();
  await page.getByLabel("Reporting period", { exact: true }).fill(purchaseDate.slice(0, 7));
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 101" })).toBeVisible();
  await page.route("**/transactions?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("description") === "Synthetic coffee 0" && url.searchParams.get("pageSize") === "100") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic summary failure" }) });
    } else await route.continue();
  });
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Synthetic coffee 0");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await page.unroute("**/transactions?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(summary.getByText("1", { exact: true })).toBeVisible();
  await expect(summary.getByText("₱1.25", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("");
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 101" })).toBeVisible();
  await page.getByRole("button", { name: /Load more/i }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Showing 40 of 101" })).toBeVisible();
  await expect(summary.getByText("₱126.25", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Synthetic coffee");
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 101" })).toBeVisible();
  await page.getByLabel("From", { exact: true }).first().fill(purchaseDate);
  await expect(summary.getByText("₱126.25", { exact: true })).toBeVisible();
  await page.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  await expect(summary.getByText("₱126.25", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Synthetic missing");
  await expect(summary.getByText("0", { exact: true })).toBeVisible();
  await expect(summary.getByText("₱0.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await expect(summary.getByText("102", { exact: true })).toBeVisible();
  await expect(summary.getByText("₱176.25", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue(purchaseDate.slice(0, 7));
  await expect(page.locator("#main-content header").getByText("Personal", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Load more/i }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Showing 40 of 102" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Synthetic other");
  await expect(summary.getByText("₱50.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 102" })).toBeVisible();
});
