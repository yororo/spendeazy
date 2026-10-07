import { expect, test } from "@playwright/test";

import { navigateSpending } from "./theme-helpers";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

for (const width of [320, 390, 1440]) {
  test(`Personal identity and Budget navigation preserve context at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    await expect(page.locator("#main-content header").getByText("Personal", { exact: true })).toBeVisible();
    const response = await page.request.get(`${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me/spaces`, {
      headers: authorizationHeaders(token),
    });
    expect(response.ok()).toBe(true);
    const spaces: unknown = await response.json();
    if (!Array.isArray(spaces)) throw new Error("Expected accessible Spaces");
    const personal: unknown = spaces.find((space: unknown) => isRecord(space) && space.kind === "personal");
    if (!isRecord(personal) || typeof personal.id !== "string") throw new Error("Expected a Personal Space ID");

    for (const path of ["/", "/insights", "/transactions", "/categories", "/imports"]) {
      await page.goto(`${path}?spaceId=${encodeURIComponent(personal.id)}`);
      await expect(page.locator("#main-content header").getByText("Personal", { exact: true })).toBeVisible();
      await expect(page.locator("#main-content header").getByText("Shared", { exact: true })).toHaveCount(0);
    }

    // Full-page navigation restarts the local synthetic session; mint the fixture identity afterwards.
    await page.goto("/");
    const fixtureToken = await createNewLocalTestUser(page);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await expect(page.getByRole("button", { name: "Manage Budgets", exact: true })).toHaveCount(0);
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(fixtureToken);
    const created = await page.request.post(`${base}/categories`, { headers, data: { name: "Navigation attention" } });
    expect(created.ok()).toBe(true);
    const category: unknown = await created.json();
    if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
    const recorded = await page.request.post(`${base}/transactions`, { headers, data: { categoryId: category.id, amount: "10.00", purchaseDate: "2026-08-01", description: "Synthetic navigation attention" } });
    expect(recorded.ok()).toBe(true);
    await page.clock.fastForward(31_000);
    const refreshNavigation = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" });
    await refreshNavigation.getByRole("link", { name: "Transactions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
    await refreshNavigation.getByRole("link", { name: "Dashboard", exact: true }).click();
    const manage = page.getByRole("button", { name: "Manage Budgets", exact: true });
    await manage.focus();
    await expect(manage).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Budget overview" })).toBeVisible();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
    await expect(page.locator("#main-content header").getByText("Personal", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Category", exact: true })).toBeVisible();

    if (width < 768) {
      const tabs = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(tabs.getByRole("link")).toHaveText(["Dashboard", "Imports", "Transactions", "Insights"]);
      await tabs.getByRole("link", { name: "Insights" }).click();
    } else {
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Insights" }).click();
    }
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
    await navigateSpending(page, "Budgets");
    await expect(page.getByRole("heading", { name: "Budget overview" })).toBeVisible();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");

    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const navigation = page.getByRole("dialog", { name: "Primary navigation" });
      await expect(navigation.getByRole("link", { name: "Budgets", exact: true })).toHaveAttribute("href", "/categories");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
    } else {
      await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Budgets", exact: true })).toHaveAttribute("href", "/categories");
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
