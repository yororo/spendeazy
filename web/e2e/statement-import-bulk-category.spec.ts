import { expect, test } from "@playwright/test";
import { authorizationHeaders, createNewLocalTestUser, isRecord, requireEnvironment } from "./test-helpers";

// Fictional, independently reconciled expenses spanning two calendar months.
function statementPdf() {
  const lines = [
    "Statement of Account", "BDO AMEX (PHP)", "Statement Date August 31, 2026",
    "Total Amount Due 4.00", "Previous Balance 0.00", "Purchases and Advances (+) 4.00",
    "Finance Charge (+) 0.00", "Fees/Other Debits (+) 0.00", "Late Charge (+) 0.00",
    "Payments/Other Credits (-) 0.00", "Sale Date Post Date Transaction Details Amount",
    "PREVIOUS STATEMENT BALANCE 0.00", "CARD NUMBER 1111-222233-33444",
    "08/01/26 08/02/26 Fictional Repeat 1.00", "08/02/26 08/03/26 FICTIONAL REPEAT 1.00", "08/03/26 08/04/26 Fictional Repeat 1.00", "08/04/26 08/05/26 Fictional Repeat! 1.00",
    "SUBTOTAL 4.00", "TOTAL 4.00",
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


for (const width of [320, 390, 1440]) {
  test(`previews repeated expenses and commits selected Manual assignments at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const token = await createNewLocalTestUser(page);
    await expect(page.getByRole("heading", { name: "Your spending at a glance" })).toBeVisible();
    const base = `${requireEnvironment("SPENDEAZY_E2E_API_BASE_URL")}/api/v1/users/me`;
    const headers = authorizationHeaders(token);
    const categories: unknown = await (await page.request.get(`${base}/categories`, { headers })).json();
    if (!Array.isArray(categories) || !isRecord(categories[0]) || typeof categories[0].id !== "string" || typeof categories[0].name !== "string") throw new Error("Expected Category");
    const category = categories[0];
    expect((await page.request.post(`${base}/category-rules`, { headers, data: { categoryId: category.id, pattern: "Fictional Repeat!", matchType: "exact" } })).ok()).toBe(true);
    await page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Primary navigation" })
      .getByRole("link", { name: "Imports", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: `fictional-repeats-${width}.pdf`, mimeType: "application/pdf", buffer: statementPdf() });
    const rows = width < 768 ? page.getByRole("list", { name: "Transactions to categorize" }) : page.getByRole("table");
    await rows.getByRole("button", { name: "Exclude Fictional Repeat", exact: true }).first().click();
    const trigger = rows.getByRole("button", { name: "Categorize repeats of FICTIONAL REPEAT", exact: true });
    await trigger.click();
    let preview = page.getByRole("dialog", { name: "Categorize repeated descriptions" });
    await expect(preview.getByRole("status")).toHaveText("2 of 3 matching rows selected");
    await expect(preview.getByRole("checkbox", { disabled: true })).toHaveCount(1);
    expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await preview.getByRole("checkbox").filter({ visible: true }).nth(0).uncheck();
    await expect(preview.getByRole("status")).toHaveText("1 of 3 matching rows selected");
    await preview.getByRole("combobox").click();
    await page.getByRole("option", { name: category.name as string, exact: true }).click();
    await preview.getByRole("button", { name: "Apply to 1 expenses" }).click();
    await trigger.click();
    preview = page.getByRole("dialog", { name: "Categorize repeated descriptions" });
    await expect(preview.getByRole("status")).toHaveText("1 of 3 matching rows selected");
    await preview.getByRole("checkbox").filter({ visible: true }).nth(1).check();
    await preview.getByRole("combobox").click();
    await page.getByRole("option", { name: category.name as string, exact: true }).click();
    await preview.getByRole("button", { name: "Apply to 2 expenses" }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Review 3 Transactions" }).click();
    await page.getByRole("button", { name: "Import 3 Transactions" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 expenses saved" })).toContainText("₱3.00");
    const rules: unknown = await (await page.request.get(`${base}/category-rules`, { headers })).json();
    expect(Array.isArray(rules) ? rules.length : null).toBe(1);
    await page.getByRole("button", { name: "View Transactions", exact: true }).click();
    await expect(page.getByRole("region", { name: "Transaction summary" })).toContainText("₱3.00");
  });
}
