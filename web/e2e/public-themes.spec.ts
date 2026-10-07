import { test } from "./preferences-fixture";
import { expect } from "@playwright/test";

import { expectReadableText } from "./financial-accessibility";
import { changeTheme } from "./theme-helpers";

for (const width of [320, 390, 768, 1023, 1024, 1440]) {
  for (const theme of ["technical", "playful"] as const) {
    test(`saved ${theme} public pages at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: "light" });
      await page.addInitScript((theme) => {
        localStorage.setItem("spendeazy.theme", theme);
        const observer = new MutationObserver(() => {
          if (!document.getElementById("root")?.firstChild) return;
          document.body.dataset.firstTheme = document.documentElement.dataset.visualTheme;
          document.body.dataset.firstAppearance = getComputedStyle(document.documentElement).colorScheme;
          observer.disconnect();
        });
        observer.observe(document, { childList: true, subtree: true });
      }, theme);
      for (const appearance of ["light", "dark", "system"] as const) {
        await page.goto("/privacy");
        await page.evaluate((appearance) => localStorage.setItem("spendeazy.appearance", appearance), appearance);
        for (const [path, title] of [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]]) {
          await page.goto(path);
          const heading = page.getByRole("heading", { name: title, exact: true, level: 1 });
          await expect(heading).toBeVisible();
          await expect(page.locator("body")).toHaveAttribute("data-first-theme", theme);
          await expect(page.locator("body")).toHaveAttribute("data-first-appearance", appearance === "dark" ? "dark" : "light");
          await expectReadableText(heading);
          const currentLink = page.getByRole("navigation", { name: "Legal documents" }).getByRole("link", { name: title });
          await expectReadableText(currentLink);
          await currentLink.hover();
          await expectReadableText(currentLink);
          await currentLink.focus();
          await expect(currentLink).toBeFocused();
          expect(await currentLink.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
          if (appearance === "system") {
            await page.emulateMedia({ colorScheme: "dark" });
            await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
            await expectReadableText(currentLink);
            await page.emulateMedia({ colorScheme: "light" });
            await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
          }
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath(`${title}-${appearance}.png`), fullPage: true });
        }
      }
    });
  }
}

for (const theme of ["technical", "playful"] as const) {
  for (const appearance of ["light", "dark", "system"] as const) {
    test(`${theme} ${appearance} account loading, error, retry and Not Found`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.addInitScript(({ theme, appearance }) => {
        localStorage.setItem("spendeazy.theme", theme);
        localStorage.setItem("spendeazy.appearance", appearance);
      }, { theme, appearance });
      let release = () => {};
      const pending = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/v1/users/me", async route => {
        if (route.request().method() !== "PUT") return route.continue();
        await pending;
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "BAD_REQUEST", message: "Fictional preparation failure", details: [] } }) });
      });
      await page.goto("/");
      const preparing = page.getByRole("status").filter({ hasText: "Preparing your account" });
      await expect(preparing).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme);
      await expect(page.locator("html")).toHaveCSS("color-scheme", appearance === "light" ? "light" : "dark");
      await expectReadableText(preparing.getByText("SPENDEAZY"));
      if (theme === "playful") await expectReadableText(preparing.getByText("Preparing your account"));
      if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath("preparing.png"), fullPage: true });
      release();
      const error = page.getByRole("alert");
      await expect(error).toContainText("Fictional preparation failure");
      await expectReadableText(error.getByText("Unable to prepare your account"));
      await expectReadableText(error.getByRole("button", { name: "Retry", exact: true }));
      if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath("preparation-error.png"), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.unroute("**/api/v1/users/me");
      await error.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
      await page.goto("/fictional-missing-page");
      const missing = page.getByRole("heading", { name: "This page doesn't exist" });
      await expect(missing).toBeVisible();
      await expectReadableText(missing);
      await expectReadableText(page.getByRole("link", { name: "Back to dashboard" }));
      if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath("not-found.png"), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("public routes follow real-tab changes and retain blocked-storage choices during sign-out", async ({ page }) => {
  await page.goto("/privacy");
  await changeTheme(page, "Playful", "Dark");
  await expectReadableText(page.getByRole("navigation", { name: "Legal documents" }).getByRole("link", { name: "Privacy Policy" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "spendeazy.theme" || key === "spendeazy.appearance") throw new DOMException("Blocked", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Theme: Playful" }).click();
  await page.getByRole("menuitemradio", { name: "Technical", exact: true }).click();
  await page.getByRole("button", { name: "Appearance: Dark" }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await page.getByRole("complementary").filter({ has: page.getByRole("button", { name: "Settings", exact: true }) }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByTestId("local-test-signed-out")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "technical");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.getByRole("button", { name: "Resume synthetic session" }).click();
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-visual-theme", "technical");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("saved Playful dark Appearance covers public route loading", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("spendeazy.theme", "playful");
    localStorage.setItem("spendeazy.appearance", "dark");
  });
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/src/pages/legal-pages.tsx*", async route => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status").filter({ hasText: "Loading page" })).toBeVisible();
    await expectReadableText(page.getByText("Loading page", { exact: true }));
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath("public-route-loading.png") });
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
});
