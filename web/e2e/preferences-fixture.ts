import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

const preferencesByTest = new WeakMap<TestInfo, Map<Page, Page>>();

export const test = base.extend<{ preferencesTabs: void }>({
  preferencesTabs: [async ({ context }, runTest, testInfo) => {
    const tabs = new Map<Page, Page>();
    preferencesByTest.set(testInfo, tabs);
    try {
      await runTest();
    } finally {
      preferencesByTest.delete(testInfo);
      for (const preferences of tabs.values()) {
        if (!preferences.isClosed()) await preferences.close();
      }
      // The owning context remains alive until this fixture has closed its tabs.
      expect(context.pages().every(page => ![...tabs.values()].includes(page))).toBe(true);
    }
  }, { auto: true }],
});

export async function preferencesPage(page: Page): Promise<Page> {
  const tabs = preferencesByTest.get(test.info());
  if (!tabs) throw new Error("Theme helpers require the preferences test fixture.");
  const existing = tabs.get(page);
  if (existing && !existing.isClosed()) return existing;
  const preferences = await page.context().newPage();
  // Register immediately so even failed navigation is cleaned up by the fixture.
  tabs.set(page, preferences);
  await preferences.goto("/");
  await expect(preferences.getByRole("heading", { name: "Your spending at a glance", exact: true })).toBeVisible();
  const navigation = preferences.getByRole("button", { name: "Open navigation", exact: true });
  if (await navigation.isVisible()) await navigation.click();
  await preferences.getByRole("button", { name: "Settings", exact: true }).click();
  return preferences;
}
