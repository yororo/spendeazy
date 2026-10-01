import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";
import { createFictionalStatementPdf } from "./fictional-repeat-statement";

function reviewPdf() {
  return createFictionalStatementPdf([
    "Statement of Account", "BDO AMEX (PHP)", "Statement Date August 31, 2026",
    "Total Amount Due 63.00", "Previous Balance 0.00", "Purchases and Advances (+) 78.00",
    "Finance Charge (+) 0.00", "Fees/Other Debits (+) 0.00", "Late Charge (+) 0.00",
    "Payments/Other Credits (-) 15.00", "Sale Date Post Date Transaction Details Amount",
    "PREVIOUS STATEMENT BALANCE 0.00", "CARD NUMBER 1111-222233-33444",
    ...Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `08/${day}/26 08/${day}/26 Fictional purchase ${day} ${index + 1}.00`;
    }),
    "08/13/26 08/13/26 PAYMENT RECEIVED -10.00", "08/14/26 08/14/26 Fictional refund -5.00",
    "SUBTOTAL 63.00", "TOTAL 63.00",
  ]);
}

for (const width of [320, 390, 1440]) {
  test(`read-only Review restores correction context and saves only expenses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const categories: unknown = await (await page.request.get(`${base}/categories`, { headers })).json();
    if (!Array.isArray(categories) || !isRecord(categories[0]) || typeof categories[0].id !== "string" || typeof categories[0].name !== "string") throw new Error("Expected Category");
    const category = categories[0];
    expect((await page.request.post(`${base}/category-rules`, { headers, data: { categoryId: category.id, pattern: "Fictional purchase", matchType: "contains" } })).ok()).toBe(true);
    await page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" }).getByRole("link", { name: "Imports", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: `fictional-review-${width}.pdf`, mimeType: "application/pdf", buffer: reviewPdf() });
    const categorize = width < 768 ? page.getByRole("list", { name: "Transactions to categorize" }) : page.getByRole("table");
    await categorize.getByRole("button", { name: "Exclude Fictional purchase 12", exact: true }).click();
    await categorize.getByRole("button", { name: "Include Fictional purchase 12", exact: true }).click();
    await categorize.getByRole("button", { name: "Exclude Fictional purchase 12", exact: true }).click();
    await page.getByRole("textbox", { name: /^Search (Transactions|descriptions)$/ }).filter({ visible: true }).fill("purchase 01");
    if (width < 768) await page.getByRole("button", { name: "Filter Transactions", exact: true }).click();
    await page.getByLabel("From", { exact: true }).filter({ visible: true }).fill("2026-08-01");
    await page.getByLabel("To", { exact: true }).filter({ visible: true }).fill("2026-08-11");
    await page.getByRole("combobox", { name: "Category", exact: true }).filter({ visible: true }).click();
    await page.getByRole("option", { name: category.name, exact: true }).click();
    await page.getByRole("combobox", { name: "Sort by", exact: true }).filter({ visible: true }).click();
    await page.getByRole("option", { name: "Amount: lowest first", exact: true }).click();
    if (width < 768) await page.keyboard.press("Escape");
    await expect(categorize.getByText("Fictional purchase 02", { exact: true })).toHaveCount(0);
    const review = page.getByRole("button", { name: "Review 11 Transactions", exact: true });
    await review.scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => ({ windowTop: scrollY, contentTop: document.getElementById("main-content")?.parentElement?.scrollTop ?? 0 }));
    await review.click();
    await expect(page.getByRole("heading", { name: "Review your imported statement" })).toBeFocused();
    const included = width < 768 ? page.getByRole("list", { name: "Transactions to review" }) : page.getByRole("table", { name: /Included expenses/ });
    const includedRows = included.getByRole(width < 768 ? "listitem" : "row").filter({ hasText: "Fictional purchase" });
    await expect(includedRows).toHaveCount(11);
    await expect(includedRows.first()).toContainText("Fictional purchase 01");
    await expect(includedRows.last()).toContainText("Fictional purchase 11");
    await expect(includedRows.first()).toContainText("₱1.00");
    await expect(included.getByText("Credit", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Exclude |Include |Remember)/ })).toHaveCount(0);
    const excludedToggle = page.getByText("Excluded rows (3)", { exact: true }).filter({ visible: true });
    await excludedToggle.focus();
    await page.keyboard.press("Enter");
    const excluded = width < 768 ? page.getByRole("list", { name: "Excluded rows to review" }) : page.getByRole("table", { name: /Excluded rows from/ });
    await expect(excluded).toContainText("Other credit — not an expense");
    await expect(excluded).toContainText("Payment — not an expense");
    await expect(excluded).toContainText("Excluded by you");
    const excludedRows = excluded.getByRole(width < 768 ? "listitem" : "row").filter({ hasText: /Fictional|PAYMENT/ });
    await expect(excludedRows.nth(0)).toContainText("Fictional refund");
    await expect(excludedRows.nth(1)).toContainText("PAYMENT RECEIVED");
    await expect(excludedRows.nth(2)).toContainText("Fictional purchase 12");
    const confirm = page.getByRole("button", { name: "Import 11 Transactions", exact: true });
    await confirm.scrollIntoViewIfNeeded();
    const total = page.getByLabel("Included expense total", { exact: true });
    await expect(total).toBeVisible();
    await expect(total).toContainText("11 included expenses");
    await expect(total).toContainText("₱66.00");
    const totalBox = await total.boundingBox();
    const confirmBox = await confirm.boundingBox();
    expect(totalBox && confirmBox && totalBox.y + totalBox.height <= confirmBox.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const back = page.getByRole("button", { name: "Back to Categorize", exact: true });
    await expect(back).toHaveCount(1);
    await back.click();
    await expect(review).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(position.windowTop);
    await expect.poll(() => page.evaluate(() => document.getElementById("main-content")?.parentElement?.scrollTop ?? 0)).toBe(position.contentTop);
    await expect(page.getByRole("textbox", { name: /^Search (Transactions|descriptions)$/ }).filter({ visible: true })).toHaveValue("purchase 01");
    if (width < 768) await page.getByRole("button", { name: "Filter Transactions, filters active" }).click();
    await expect(page.getByLabel("From", { exact: true }).filter({ visible: true })).toHaveValue("2026-08-01");
    await expect(page.getByLabel("To", { exact: true }).filter({ visible: true })).toHaveValue("2026-08-11");
    await expect(page.getByRole("combobox", { name: "Sort by", exact: true }).filter({ visible: true })).toContainText("Amount: lowest first");
    await expect(page.getByRole("combobox", { name: "Category", exact: true }).filter({ visible: true })).toContainText(category.name);
    if (width < 768) await page.keyboard.press("Escape");
    await review.click();
    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "11 expenses saved" })).toContainText("₱66.00");
    await page.getByRole("button", { name: "View Transactions", exact: true }).click();
    await expect(page.getByRole("region", { name: "Transaction summary" })).toContainText("₱66.00");
    await expect(page.getByText("PAYMENT RECEIVED", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Fictional refund", { exact: true })).toHaveCount(0);
  });
}
