import { expect, test, type Page } from "@playwright/test";

import { expectFinancialTokenContrast } from "./financial-accessibility";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

const clock = process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z";

async function openSettings(page: Page) {
  const drawerTrigger = page.getByRole("button", { name: "Open navigation" });
  if (await drawerTrigger.isVisible()) await drawerTrigger.click();
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  return settings;
}

async function selectAppearance(page: Page, appearance: "Light" | "Dark" | "System") {
  await page.getByRole("button", { name: /^Appearance:/ }).click();
  await page.getByRole("menuitemradio", { name: appearance, exact: true }).click();
}

async function expectAppearance(page: Page, value: "light" | "dark") {
  await expect.poll(() => page.locator("html").evaluate((element) => getComputedStyle(element).colorScheme)).toBe(value);
}

for (const width of [320, 390, 768, 1023, 1024, 1440]) {
  test(`inline Theme and Appearance matrix preserves Dashboard at ${width}px`, async ({ page }, testInfo) => {
    await page.clock.install({ time: clock });
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await createNewLocalTestUser(page);
    const summary = page.getByRole("region", { name: "Monthly summary" });
    await expect(summary).toBeVisible();
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await expect(summary).not.toHaveAttribute("aria-busy", "true");
    const summaryText = await summary.innerText();
    const route = page.url();
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url());
    });
    const settings = await openSettings(page);
    await expect(page.getByRole("radio", { name: "Technical" })).toBeChecked();
    for (const theme of ["Playful", "Technical"] as const) {
      await page.getByRole("radio", { name: theme }).check();
      await expect(settings).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("radio", { name: theme })).toBeChecked();
      for (const appearance of ["Light", "Dark", "System"] as const) {
        await selectAppearance(page, appearance);
        await expect(page.getByRole("radio", { name: theme })).toBeChecked();
        await expectAppearance(page, appearance === "Dark" ? "dark" : "light");
        await expectFinancialTokenContrast(page);
        if (theme === "Playful" && appearance === "Dark") {
          await page.screenshot({ path: testInfo.outputPath(`playful-dark-settings-${width}.png`) });
        }
        if (appearance === "System") {
          await page.emulateMedia({ colorScheme: "dark" });
          await expectAppearance(page, "dark");
          await expectFinancialTokenContrast(page);
          await page.emulateMedia({ colorScheme: "light" });
          await expectAppearance(page, "light");
        }
      }
    }
    await expect(page).toHaveURL(route);
    await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
    expect(writes).toEqual([]);
    // Native radios provide the browser's standard arrow-key checked/focus behavior.
    const technical = page.getByRole("radio", { name: "Technical" });
    await technical.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Playful" })).toBeFocused();
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Sign out", exact: true }).first()).toBeVisible();
    await settings.click();
    if (width < 1024) await page.keyboard.press("Escape");
    expect(await summary.innerText()).toBe(summaryText);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toHaveCSS("font-family", /Nunito Variable/);
    await expect(summary.getByText("Total spend", { exact: true }).locator("../..")).toHaveCSS("background-color", "rgb(8, 116, 67)");
    await expect(page.getByRole("button", { name: "Manage Budgets", exact: true })).toHaveCSS("background-color", "rgb(255, 240, 187)");
    const selectedNavigation = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" }).getByRole("link", { name: "Dashboard", exact: true });
    if (width < 768 || width >= 1024) await expect(selectedNavigation).toHaveCSS("background-color", "rgb(216, 242, 223)");
    await page.screenshot({ path: testInfo.outputPath(`playful-${width}.png`), fullPage: true });
  });
}

test("restores Theme before the first render and retains it across sign-out and re-entry", async ({ page }) => {
  await page.clock.install({ time: clock });
  await page.addInitScript(() => {
    localStorage.setItem("spendeazy.theme", "playful");
    localStorage.setItem("spendeazy.appearance", "dark");
    const observer = new MutationObserver(() => {
      if (!document.getElementById("root")?.firstChild) return;
      document.body.dataset.firstTheme = document.documentElement.dataset.visualTheme;
      document.body.dataset.firstAppearance = getComputedStyle(document.documentElement).colorScheme;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-first-theme", "playful");
  await expect(page.locator("body")).toHaveAttribute("data-first-appearance", "dark");
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
  await page.getByRole("complementary").filter({ has: page.getByRole("button", { name: "Settings", exact: true }) }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByTestId("local-test-signed-out")).toBeVisible();
  await expectAppearance(page, "dark");
  await page.getByRole("button", { name: "Resume synthetic session" }).click();
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
});

test("synchronizes real tabs and resolves invalid, removed, or cleared Theme values to Technical", async ({ page, context }) => {
  await page.clock.install({ time: clock });
  await page.goto("/");
  await openSettings(page);
  const other = await context.newPage();
  await other.clock.install({ time: clock });
  await other.goto("/");
  await openSettings(other);
  await page.getByRole("radio", { name: "Playful" }).check();
  await expect(other.getByRole("radio", { name: "Playful" })).toBeChecked();
  await selectAppearance(other, "Dark");
  await expectAppearance(page, "dark");
  await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
  for (const value of ["invalid", null, "clear"] as const) {
    await page.getByRole("radio", { name: "Technical" }).check();
    await page.getByRole("radio", { name: "Playful" }).check();
    await expect(other.getByRole("radio", { name: "Playful" })).toBeChecked();
    await page.evaluate((value) => {
      if (value === "clear") localStorage.clear();
      else if (value === null) localStorage.removeItem("spendeazy.theme");
      else localStorage.setItem("spendeazy.theme", value);
    }, value);
    await expect(other.getByRole("radio", { name: "Technical" })).toBeChecked();
  }
  await other.close();
});

test("invalid cold-load storage and blocked reads/writes still allow current-visit selection", async ({ page }) => {
  await page.clock.install({ time: clock });
  await page.addInitScript(() => {
    localStorage.setItem("spendeazy.theme", "unknown");
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "spendeazy.theme") throw new DOMException("Blocked", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "spendeazy.theme") throw new DOMException("Blocked", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Technical" })).toBeChecked();
  await page.getByRole("radio", { name: "Playful" }).check();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 248, 241)");
  await expect(page.getByRole("radio", { name: "Playful" })).toBeChecked();
});

test("Theme changes preserve the selected Space, route and scrolling pane", async ({ page }) => {
  await page.clock.install({ time: clock });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  const scrollHost = page.locator("[data-page-scroll-host]");
  await scrollHost.evaluate((element) => { element.scrollTop = 200; });
  const scroll = await scrollHost.evaluate((element) => element.scrollTop);
  const route = page.url();
  const space = await page.getByRole("button", { name: /^Active Space:/ }).first().textContent();
  await openSettings(page);
  await page.getByRole("radio", { name: "Playful" }).check();
  await expect(page).toHaveURL(route);
  expect(await scrollHost.evaluate((element) => element.scrollTop)).toBe(scroll);
  expect(await page.getByRole("button", { name: /^Active Space:/ }).first().textContent()).toBe(space);
});

test("Theme changes preserve recorded money and exact Category Colors", async ({ page }) => {
  await page.clock.install({ time: clock });
  await page.goto("/");
  const token = await createNewLocalTestUser(page);
  await expect(page.getByTestId("local-test-active-user")).toContainText("Fresh Local User");
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  await expect(page.getByText(/No spending recorded in this Reporting Period/)).toBeVisible();
  const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
  const headers = authorizationHeaders(token);
  const created = await page.request.post(`${base}/categories`, {
    headers, data: { name: "Theme fixture", color: "coral" },
  });
  expect(created.status()).toBe(201);
  const category: unknown = await created.json();
  if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Category ID");
  const recorded = await page.request.post(`${base}/transactions`, {
    headers, data: { description: "Fictional theme purchase", amount: "123.45", categoryId: category.id, purchaseDate: "2026-08-15" },
  });
  expect(recorded.status()).toBe(201);
  await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
  const summary = page.getByRole("region", { name: "Monthly summary" });
  await expect(summary.getByText("₱123.45", { exact: true })).toHaveCount(3);
  const categoryBar = page.getByRole("img", { name: /Theme fixture/ });
  const colorBefore = await categoryBar.evaluate((element) => getComputedStyle(element.firstElementChild ?? element).backgroundColor);
  expect(colorBefore).toBe("rgb(249, 115, 22)");
  await openSettings(page);
  await page.getByRole("radio", { name: "Playful" }).check();
  await expect(summary.getByText("₱123.45", { exact: true })).toHaveCount(3);
  expect(await categoryBar.evaluate((element) => getComputedStyle(element.firstElementChild ?? element).backgroundColor)).toBe(colorBefore);
});

test("an invalid saved Theme resolves to Technical on a cold load", async ({ page }) => {
  await page.clock.install({ time: clock });
  await page.addInitScript(() => localStorage.setItem("spendeazy.theme", "unknown"));
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Technical" })).toBeChecked();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
