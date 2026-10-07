import { test } from "./preferences-fixture";
import { expect } from "@playwright/test";
import { expectFinancialTokenContrast, expectReadableText } from "./financial-accessibility";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";
import { changeTheme, expectResponsiveContainment, navigateSpending } from "./theme-helpers";

for (const width of [390, 1440]) {
  test(`spending routes share visual roles and preserve context at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByTestId("local-test-active-user")).toContainText("Fresh Local User");
    await expect(page.getByText(/No Categories need attention yet/)).toBeVisible();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const created = await page.request.post(`${base}/categories`, { headers, data: { name: "Theme spending", color: "coral" } });
    expect(created.status()).toBe(201);
    const category: unknown = await created.json();
    if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
    expect((await page.request.put(`${base}/categories/${category.id}/budget`, { headers, data: { amount: "100.00", period: "monthly" } })).ok()).toBe(true);
    expect((await page.request.post(`${base}/transactions`, { headers, data: { amount: "123.45", description: "Fictional theme purchase", categoryId: category.id, purchaseDate: "2026-08-15" } })).ok()).toBe(true);
    for (const [route, heading, destination] of [["transactions", "Your spending", "Transactions"], ["categories", "Budget overview", "Budgets"], ["insights", "Insights", "Insights"]] as const) {
      await navigateSpending(page, destination);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const url = page.url();
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await expect(page.getByText("Loading matching Transactions", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Loading Budget overview", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Loading Insights", { exact: true })).toHaveCount(0);
      await expect(page.locator("main").getByText("₱123.45", { exact: true }).first()).toBeVisible();
      const content = await page.locator("main").textContent();
      const space = await page.getByRole("button", { name: /^Active Space:/ }).filter({ visible: true }).first().textContent();
      const writes: string[] = [];
      const observe = (request: import("@playwright/test").Request) => {
        if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url());
      };
      page.on("request", observe);
      for (const theme of ["Technical", "Playful"] as const) {
        for (const appearance of ["Light", "Dark"] as const) {
          await page.emulateMedia({ colorScheme: "dark" });
          await changeTheme(page, theme, appearance);
          await expect(page.locator("html")).toHaveAttribute("data-theme", appearance.toLowerCase());
          await expectFinancialTokenContrast(page);
          await expectReadableText(page.getByRole("heading", { name: heading, exact: true }));
          await expectReadableText(page.locator("main").getByText("₱123.45", { exact: true }).first());
          await expect(page).toHaveURL(url);
          await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
          expect(await page.locator("main").textContent()).toBe(content);
          expect(await page.getByRole("button", { name: /^Active Space:/ }).filter({ visible: true }).first().textContent()).toBe(space);
          const header = page.locator("main header").first();
          const border = await header.evaluate(element => getComputedStyle(element).borderBottomColor);
          const expected = await page.locator("html").evaluate(element => getComputedStyle(element).getPropertyValue("--structure").trim());
          // Resolve the public role into a browser color, rather than assert its CSS syntax.
          expect(border).toBe(await page.evaluate(color => {
            const probe = document.createElement("span"); probe.style.color = color;
            document.body.append(probe); const result = getComputedStyle(probe).color; probe.remove(); return result;
          }, expected));
          const overflow = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => ({ tag: element.tagName, class: element.className })).slice(0, 10));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify({ route, theme, appearance, overflow })).toBe(true);
        }
      }
      page.off("request", observe);
      expect(writes).toEqual([]);
      if (width === 390) await expectResponsiveContainment(page, width);
      if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath(`${route}-${width}.png`), fullPage: true });
    }
  });
}

for (const [destination, heading] of [["Transactions", "Your spending"], ["Budgets", "Budget overview"], ["Insights", "Insights"]] as const) {
  test(`${destination} loading and error states follow Theme and allow retry`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.goto("/");
    await createNewLocalTestUser(page);
    await expect(page.getByText(/No Categories need attention yet/)).toBeVisible();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/users/me/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (!/\/(categories|category-summaries|transactions)$/.test(path)) return route.continue();
      await pending;
      await route.fulfill({ status: 503, json: { message: "Fictional service interruption" } });
    });
    await navigateSpending(page, destination);
    const loading = page.getByRole("status").filter({ hasText: /Loading (Transactions|Budget overview|Insights)/ });
    await expect(loading).toBeVisible();
    await changeTheme(page, "Playful", "Dark");
    await expect(loading).toBeVisible();
    release();
    await expect(page.getByText("Unable to load this page", { exact: true })).toBeVisible();
    for (const theme of ["Technical", "Playful"] as const) {
      for (const appearance of ["Light", "Dark"] as const) {
        await changeTheme(page, theme, appearance);
        await expectFinancialTokenContrast(page);
        await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
      }
    }
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  });
}
