import { expect, type Page } from "@playwright/test";

export async function navigateSpending(page: Page, destination: "Transactions" | "Budgets" | "Insights" | "Imports" | "Sharing" | "History") {
  const link = page.getByRole("link", { name: destination, exact: true }).filter({ visible: true });
  if (!await link.count()) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: destination, exact: true }).filter({ visible: true }).first().click();
}

// A second real tab can reach Settings while the first tab has a modal editor.
export async function changeTheme(page: Page, theme: "Technical" | "Playful", appearance: "Light" | "Dark" | "System" = "System") {
  const preferences = await page.context().newPage();
  try {
    await preferences.goto("/");
    await expect(preferences.getByRole("heading", { name: "Your spending at a glance", exact: true })).toBeVisible();
    const navigation = preferences.getByRole("button", { name: "Open navigation", exact: true });
    if (await navigation.isVisible()) await navigation.click();
    await preferences.getByRole("button", { name: "Settings", exact: true }).click();
    await preferences.getByRole("button", { name: /^Theme:/ }).click();
    await preferences.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await expect(preferences.locator("html")).toHaveAttribute("data-visual-theme", theme.toLowerCase());
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.toLowerCase());
    await preferences.getByRole("button", { name: /^Appearance:/ }).click();
    await preferences.getByRole("menuitemradio", { name: appearance, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.toLowerCase());
    const resolved = appearance === "System"
      ? await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : appearance.toLowerCase();
    await expect(page.locator("html")).toHaveAttribute("data-theme", resolved);
    await page.evaluate(() => document.fonts.ready);
  } finally {
    await preferences.close();
  }
}

// Observe the active workflow only: the Settings tab provisions its own session.
export async function expectWorkflowSurvivesThemeChange(page: Page, theme: "Technical" | "Playful", appearance: "Light" | "Dark" | "System") {
  const url = page.url();
  const content = await page.locator("#main-content").textContent();
  const focused = await page.evaluateHandle(() => document.activeElement);
  const scroll = () => page.evaluate(() => ({ window: scrollY, pane: document.querySelector("[data-page-scroll-host]")?.scrollTop ?? 0 }));
  const position = await scroll();
  const writes: string[] = [];
  const observe = (request: import("@playwright/test").Request) => {
    if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url());
  };
  page.on("request", observe);
  try {
    await changeTheme(page, theme, appearance);
    await expect(page).toHaveURL(url);
    expect(await page.locator("#main-content").textContent()).toBe(content);
    expect(await focused.evaluate(element => element?.isConnected && element === document.activeElement)).toBe(true);
    const limits = await page.evaluate(() => {
      const pane = document.querySelector("[data-page-scroll-host]");
      return { window: Math.max(0, document.documentElement.scrollHeight - innerHeight), pane: pane ? pane.scrollHeight - pane.clientHeight : 0 };
    });
    // Font wrapping can shorten a page; the browser clamps offsets at its end.
    expect(await scroll()).toEqual({ window: Math.min(position.window, limits.window), pane: Math.min(position.pane, limits.pane) });
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    page.off("request", observe);
    await focused.dispose();
  }
}
