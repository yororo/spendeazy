import { test } from "./preferences-fixture";
import { expect } from "@playwright/test";
import { expectFinancialTokenContrast, expectReadableText } from "./financial-accessibility";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";
import { expectResponsiveContainment, expectWorkflowSurvivesThemeChange, navigateSpending } from "./theme-helpers";

for (const width of [390, 1440]) {
  test(`Sharing continues across Themes and archives read-only history at ${width}px`, async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    const clock = requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK");
    await page.clock.install({ time: clock });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sharing");
    const senderToken = await createNewLocalTestUser(page);
    await expect(page.getByTestId("local-test-active-user")).toContainText("Fresh Local User");
    await expect(page.getByRole("heading", { name: "Invite someone you trust", exact: true })).toBeVisible();
    await navigateSpending(page, "Imports");
    await expect(page.getByRole("heading", { name: "Upload your statement", exact: true })).toBeVisible();
    for (const theme of ["Technical", "Playful"] as const) {
      for (const appearance of ["Light", "Dark"] as const) {
        await expectWorkflowSurvivesThemeChange(page, theme, appearance);
        const browse = page.getByRole("button", { name: "Browse files", exact: true });
        await expectReadableText(browse.locator("svg"));
        await expectReadableText(browse);
      }
    }
    if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath(`upload-${width}.png`), fullPage: true, animations: "disabled" });
    await navigateSpending(page, "Sharing");
    await page.getByRole("button", { name: "Create Invite Code", exact: true }).click();
    await expect(page.locator("code")).toHaveText(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u);
    const code = await page.locator("code").innerText();
    await expectWorkflowSurvivesThemeChange(page, "Playful", "Light");
    await expect(page.locator("code")).toHaveText(code);
    const recipientContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width, height: 900 } });
    const recipient = await recipientContext.newPage();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    try {
      await recipient.clock.install({ time: clock });
      await recipient.goto(`${new URL(page.url()).origin}/sharing`);
      await createNewLocalTestUser(recipient);
      await expect(recipient.getByTestId("local-test-active-user")).toContainText("Fresh Local User");
      await recipient.getByLabel("Invite Code", { exact: true }).fill(code);
      await expectWorkflowSurvivesThemeChange(recipient, "Playful", "Dark");
      await expect(recipient.getByLabel("Invite Code", { exact: true })).toHaveValue(code);
      const savedClaim = recipient.waitForResponse(response =>
        response.url().endsWith("/api/v1/users/me/invitations/claims") && response.request().method() === "POST",
      );
      await recipient.getByRole("button", { name: "Save Invitation", exact: true }).click();
      const claimResponse = await savedClaim;
      expect(claimResponse.status(), await claimResponse.text()).toBe(201);
      await expect(recipient.getByRole("button", { name: "Join Shared Space", exact: true })).toBeVisible();
      await expectWorkflowSurvivesThemeChange(recipient, "Technical", "Light");
      await recipient.getByRole("button", { name: "Join Shared Space", exact: true }).click();
      await expect(recipient).toHaveURL(/\/\?spaceId=[1-9]\d*$/u);
      const spaceId = new URL(recipient.url()).searchParams.get("spaceId");
      if (!spaceId) throw new Error("Expected joined Shared Space");
      const scoped = `${base}/spaces/${spaceId}`;
      const headers = authorizationHeaders(senderToken);
      const categoryResponse = await page.request.post(`${scoped}/categories`, { headers, data: { name: "Fictional shared theme", color: "teal" } });
      expect(categoryResponse.ok()).toBe(true);
      const category: unknown = await categoryResponse.json();
      if (!isRecord(category) || typeof category.id !== "string") throw new Error("Expected Shared Category");
      expect((await page.request.post(`${scoped}/transactions`, { headers, data: { amount: "45.67", purchaseDate: "2026-09-04", description: "Fictional shared theme dinner", categoryId: category.id } })).ok()).toBe(true);
      await navigateSpending(page, "Imports");
      await navigateSpending(page, "Sharing");
      await expect(page.getByRole("button", { name: "End sharing", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Active Space:/ }).filter({ visible: true }).first().click();
      await page.getByRole("menuitemradio", { name: "Shared", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`spaceId=${spaceId}$`));
      // URL changes precede the menu's asynchronous focus restoration.
      await expect(page.getByRole("button", { name: "Active Space: Shared", exact: true }).filter({ visible: true }).first()).toBeFocused();
      await expectWorkflowSurvivesThemeChange(page, "Technical", "Dark");
      await page.getByRole("button", { name: "End sharing", exact: true }).click();
      const archive = page.getByRole("dialog", { name: "End sharing and archive this Space?" });
      await expect(archive).toBeVisible();
      await expectWorkflowSurvivesThemeChange(page, "Playful", "Dark");
      await expect(archive.getByRole("button", { name: "Confirm archive", exact: true })).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "End sharing", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "End sharing", exact: true }).click();
      await archive.getByRole("button", { name: "Confirm archive", exact: true }).click();
      await expect(page).toHaveURL(/\/sharing$/u);
      await navigateSpending(recipient, "Sharing");
      await expect(recipient.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
      await expect(recipient).toHaveURL(/\/sharing$/u);
      await expect(recipient.getByRole("button", { name: "Create Invite Code", exact: true })).toBeVisible();
      await expectWorkflowSurvivesThemeChange(recipient, "Playful", "Dark");
      await recipient.getByRole("button", { name: "Mark read", exact: true }).click();
      await expect(recipient.getByRole("button", { name: "Mark read", exact: true })).toHaveCount(0);
      await navigateSpending(page, "History");
      await page.getByRole("link", { name: /^View history for Shared/ }).click();
      await expect(page.getByRole("heading", { name: "Archived Space history", exact: true })).toBeVisible();
      await expect(page.getByText("Fictional shared theme dinner", { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByText("No Transactions have been deleted.", { exact: true }).filter({ visible: true })).toBeVisible();
      if (width === 390) await expectResponsiveContainment(page, width);
      const marker = page.getByText("Fictional shared theme", { exact: true }).filter({ visible: true }).first().locator('[aria-hidden="true"]');
      await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
      for (const theme of ["Technical", "Playful"] as const) {
        for (const appearance of ["Light", "Dark"] as const) {
          await page.emulateMedia({ colorScheme: "dark" });
          await expectWorkflowSurvivesThemeChange(page, theme, appearance);
          await expectFinancialTokenContrast(page);
          await expectReadableText(page.getByRole("heading", { name: "Archived Space history", exact: true }));
          await expect(marker).toHaveCSS("background-color", "rgb(15, 118, 110)");
          await expect(page.getByRole("region", { name: "History summary", exact: true })).toContainText("₱45.67");
          await expect(page.getByRole("button", { name: /^(Edit|Delete) Fictional shared theme dinner/ })).toHaveCount(0);
        }
      }
      if (width < 768) {
        await page.getByRole("button", { name: "More actions for Fictional shared theme dinner", exact: true }).click();
        await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toHaveCount(0);
        await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Activity", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "View activity for Fictional shared theme dinner", exact: true }).filter({ visible: true }).click();
      }
      const activity = page.getByRole("dialog");
      await expect(activity).toBeVisible();
      await expect(activity.getByRole("list", { name: "Transaction activity events", exact: true })).toBeVisible();
      await expectWorkflowSurvivesThemeChange(page, "Playful", "Light");
      await page.keyboard.press("Escape");
      if (process.env.SPENDEAZY_E2E_SCREENSHOTS === "1") await page.screenshot({ path: testInfo.outputPath(`archived-history-${width}.png`), fullPage: true, animations: "disabled" });
      const denied = await page.request.post(`${scoped}/transactions`, { headers, data: { amount: "1.00", purchaseDate: "2026-09-04", description: "Fictional denied write" } });
      expect(denied.status()).toBe(403);
    } finally {
      await recipientContext.close();
    }
  });
}
