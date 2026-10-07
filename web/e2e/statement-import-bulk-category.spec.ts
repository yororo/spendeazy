import { test } from "./preferences-fixture";
import { expect } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

import { statementPdf } from "./fictional-repeat-statement";
import { expectWorkflowSurvivesThemeChange } from "./theme-helpers";

for (const width of [320, 390, 1440]) {
  test(`previews repeated expenses and commits selected Manual assignments at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const categories: unknown = await (await page.request.get(`${base}/categories`, { headers })).json();
    if (!Array.isArray(categories) || !isRecord(categories[0]) || typeof categories[0].id !== "string" || typeof categories[0].name !== "string") throw new Error("Expected Category");
    const category = categories[0];
    expect((await page.request.post(`${base}/category-rules`, { headers, data: { categoryId: category.id, pattern: "Fictional Repeat!", matchType: "exact" } })).ok()).toBe(true);
    await page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" })
      .getByRole("link", { name: "Imports", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: `fictional-repeats-${width}.pdf`, mimeType: "application/pdf", buffer: statementPdf() });
    const rows = width < 768 ? page.getByRole("list", { name: "Transactions to categorize" }) : page.getByRole("table");
    await rows.getByRole("button", { name: "Exclude Fictional Repeat", exact: true }).first().click();
    const trigger = rows.getByRole("button", { name: "Categorize repeats of FICTIONAL REPEAT", exact: true });
    await trigger.click();
    let preview = page.getByRole("dialog", { name: "Categorize repeated descriptions" });
    await expect(preview.getByRole("status")).toHaveText("2 of 3 matching rows selected");
    await expect(preview.getByRole("checkbox", { disabled: true })).toHaveCount(1);
    expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await preview.getByRole("checkbox").filter({ visible: true }).nth(0).uncheck();
    await expect(preview.getByRole("status")).toHaveText("1 of 3 matching rows selected");
    await preview.getByRole("combobox").click();
    await page.getByRole("option", { name: category.name as string, exact: true }).click();
    await expectWorkflowSurvivesThemeChange(page, "Playful", "Light");
    await expectWorkflowSurvivesThemeChange(page, "Technical", "Dark");
    await expect(preview.getByRole("status")).toHaveText("1 of 3 matching rows selected");
    await expect(preview.getByRole("checkbox", { disabled: true })).toHaveCount(1);
    await preview.getByRole("button", { name: "Apply to 1 expenses" }).click();
    await trigger.click();
    preview = page.getByRole("dialog", { name: "Categorize repeated descriptions" });
    await expect(preview.getByRole("status")).toHaveText("1 of 3 matching rows selected");
    await preview.getByRole("checkbox").filter({ visible: true }).nth(1).check();
    await preview.getByRole("combobox").click();
    await page.getByRole("option", { name: category.name as string, exact: true }).click();
    await preview.getByRole("button", { name: "Apply to 2 expenses" }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Review 3 Transactions" }).click();
    await page.getByRole("button", { name: "Import 3 Transactions" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 expenses saved" })).toContainText("₱3.00");
    const rules: unknown = await (await page.request.get(`${base}/category-rules`, { headers })).json();
    expect(Array.isArray(rules) ? rules.length : null).toBe(1);
    await page.getByRole("button", { name: "View Transactions", exact: true }).click();
    await expect(page.getByRole("region", { name: "Transaction summary" })).toContainText("₱3.00");
  });
}
