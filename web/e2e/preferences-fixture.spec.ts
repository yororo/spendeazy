import { expect } from "@playwright/test";
import { test, preferencesPage } from "./preferences-fixture";
import { changeTheme, expectWorkflowSurvivesThemeChange } from "./theme-helpers";
import { createNewLocalTestUser, requireEnvironment } from "./test-helpers";

test("reuses one real Settings tab without reloading or replacing its owning User", async ({ page, context }) => {
  await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
  await page.goto("/");
  await createNewLocalTestUser(page);
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  const identity = await page.getByTestId("local-test-active-user").textContent();
  await expectWorkflowSurvivesThemeChange(page, "Playful", "Dark");
  const preferences = await preferencesPage(page);
  let navigations = 0;
  preferences.on("framenavigated", frame => { if (frame === preferences.mainFrame()) navigations += 1; });
  await expectWorkflowSurvivesThemeChange(page, "Technical", "Light");
  await expectWorkflowSurvivesThemeChange(page, "Playful", "System");
  expect(await preferencesPage(page)).toBe(preferences);
  expect(context.pages()).toHaveLength(2);
  expect(navigations).toBe(0);
  await expect(page.getByTestId("local-test-active-user")).toHaveText(identity ?? "");
  // New tabs intentionally begin with the fixed synthetic identity, not the
  // fresh workflow User. Preferences synchronize through browser storage only.
  await expect(preferences.getByTestId("local-test-active-user")).toContainText("Local Test User");
});

test("recreates a closed Settings tab within its owning test", async ({ page, context }) => {
  await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
  await page.goto("/");
  await changeTheme(page, "Playful", "Dark");
  const previous = await preferencesPage(page);
  await previous.close();
  await changeTheme(page, "Technical", "Light");
  expect(await preferencesPage(page)).not.toBe(previous);
  expect(context.pages()).toHaveLength(2);
});
