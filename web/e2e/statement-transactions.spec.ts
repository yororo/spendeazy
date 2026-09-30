import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

// Fictional, independently reconciled expenses spanning two calendar months.
function statementPdf() {
  const lines = [
    "Statement of Account", "BDO AMEX (PHP)", "Statement Date August 31, 2026",
    "Total Amount Due 21.00", "Previous Balance 0.00", "Purchases and Advances (+) 21.00",
    "Finance Charge (+) 0.00", "Fees/Other Debits (+) 0.00", "Late Charge (+) 0.00",
    "Payments/Other Credits (-) 0.00", "Sale Date Post Date Transaction Details Amount",
    "PREVIOUS STATEMENT BALANCE 0.00", "CARD NUMBER 1111-222233-33444",
    ...Array.from({ length: 21 }, (_, index) => `${index < 10 ? "07/31/26 08/01/26" : "08/01/26 08/02/26"} Fictional Scope Expense ${index} 1.00`),
    "SUBTOTAL 21.00", "TOTAL 21.00",
  ];
  const stream = `BT /F1 11 Tf 16 TL 40 750 Td\n${lines.map((line) => `(${line.replace(/[\\()]/gu, "\\$&")}) Tj T*`).join("\n")}\nET\n`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const offset = Buffer.byteLength(pdf); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test("opens saved statement expenses across months, narrows them, and restores the prior month", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const token = await createNewLocalTestUser(page);
  await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
  const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
  const headers = authorizationHeaders(token);
  const spaces: unknown = await (await page.request.get(`${base}/spaces`, { headers })).json();
  if (!Array.isArray(spaces) || !isRecord(spaces[0]) || typeof spaces[0].id !== "string") throw new Error("Expected Personal Space");
  const spaceId = spaces[0].id;
  const categories: unknown = await (await page.request.get(`${base}/categories`, { headers })).json();
  if (!Array.isArray(categories) || !isRecord(categories[0]) || typeof categories[0].id !== "string") throw new Error("Expected Category");
  const categoryId = categories[0].id;
  expect((await page.request.post(`${base}/category-rules`, { headers, data: { categoryId, pattern: "Fictional Scope Expense", matchType: "contains" } })).ok()).toBe(true);
  expect((await page.request.post(`${base}/transactions`, { headers, data: { purchaseDate: "2026-07-31", description: "Unrelated same-date expense", amount: "99.00" } })).ok()).toBe(true);
  await page.getByLabel("Reporting period", { exact: true }).fill("2026-06");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Imports", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "fictional-two-months.pdf", mimeType: "application/pdf", buffer: statementPdf() });
  await page.getByRole("button", { name: "Review 21 Transactions" }).click();
  await page.getByRole("button", { name: "Import 21 Transactions" }).click();
  await expect(page.getByRole("heading", { name: "Statement imported" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "21 expenses saved" })).toContainText("₱21.00");
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/transactions?**", async (route) => { await gate; await route.continue(); });
  await page.getByRole("button", { name: "View Transactions", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading statement Transactions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Transaction summary" })).toHaveCount(0);
  release();
  await page.unrouteAll({ behavior: "wait" });
  const statementId = new URL(page.url()).searchParams.get("statementImportId");
  expect(statementId).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("spaceId")).toBe(spaceId);
  const summary = page.getByRole("region", { name: "Transaction summary" });
  await expect(summary).toContainText("₱21.00");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Return to monthly view", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Recorded expense activity matching this view:/)).toContainText("2026-07-31 – 2026-08-01");
  await expect(page.getByText("Unrelated same-date expense", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 21" })).toBeVisible();
  await page.getByRole("button", { name: /Load more/i }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Showing 21 of 21" })).toBeVisible();
  await page.getByLabel("From", { exact: true }).first().fill("2026-08-01");
  await expect(summary).toContainText("₱11.00");
  await page.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: "BDO · AMEX", exact: true }).click();
  await expect(summary).toContainText("₱11.00");
  await page.getByLabel("Category", { exact: true }).first().click();
  await page.getByRole("option", { name: String(categories[0].name), exact: true }).click();
  await expect(summary).toContainText("₱11.00");
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Fictional Scope Expense 20");
  await expect(summary).toContainText("₱1.00");
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Unrelated");
  await expect(summary).toContainText("₱0.00");
  await expect(page.getByRole("cell", { name: "No saved expenses match these filters in this statement." })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await expect(summary).toContainText("₱21.00");
  await expect(page.getByRole("status").filter({ hasText: "Showing 20 of 21" })).toBeVisible();

  // Fail the real boundary deliberately, then recover in the requested scope.
  await page.route("**/transactions?**", (route) => route.fulfill({ status: 503, json: { message: "Synthetic statement failure" } }));
  await page.getByRole("textbox", { name: "Search descriptions", exact: true }).first().fill("Fictional Scope Expense 20");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Statement filter" })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await page.unroute("**/transactions?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(summary).toContainText("₱1.00");
  await page.getByRole("button", { name: "Return to monthly view", exact: true }).click();
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-06");
  await expect(summary).toContainText("₱0.00");

  const otherToken = await createNewLocalTestUser(page);
  const denied = await page.request.get(`${base}/spaces/${spaceId}/transactions?statementImportId=${statementId}`, { headers: authorizationHeaders(otherToken) });
  expect(denied.status()).toBe(403);
});
