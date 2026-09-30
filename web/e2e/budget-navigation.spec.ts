import { expect, test } from "@playwright/test";

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

    await page.goto(`/?spaceId=${encodeURIComponent(personal.id)}`);
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
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
    await page.getByRole("button", { name: "Monthly view", exact: true }).click();
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
    await page.getByRole("button", { name: "Manage Budgets", exact: true }).click();
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
