import { expect, type Page } from "@playwright/test";

export async function navigateSpending(page: Page, destination: "Transactions" | "Budgets" | "Insights") {
  const link = page.getByRole("link", { name: destination, exact: true }).filter({ visible: true });
  if (!await link.count()) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: destination, exact: true }).filter({ visible: true }).first().click();
}

// A second real tab can reach Settings while the first tab has a modal editor.
export async function changeTheme(page: Page, theme: "Technical" | "Playful", appearance: "Light" | "Dark" | "System" = "System") {
  const preferences = await page.context().newPage();
  try {
    await preferences.goto("/");
    await preferences.getByRole("button", { name: "Settings", exact: true }).click();
    await preferences.getByRole("button", { name: /^Theme:/ }).click();
    await preferences.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await preferences.getByRole("button", { name: /^Appearance:/ }).click();
    await preferences.getByRole("menuitemradio", { name: appearance, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-visual-theme", theme.toLowerCase());
  } finally {
    await preferences.close();
  }
}
