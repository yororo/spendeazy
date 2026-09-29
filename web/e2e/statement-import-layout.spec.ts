import { expect, test } from "@playwright/test";

// A fictional, reconciled statement exercises the real PDF extraction and Upload
// path. Plain ASCII keeps byte offsets and PDF string escaping deterministic.
function createStatementPdf() {
  const lines = [
    "Statement of Account",
    "BDO AMEX (PHP)",
    "Statement Date August 31, 2026",
    "Total Amount Due 25.50",
    "Previous Balance 0.00",
    "Purchases and Advances (+) 25.50",
    "Finance Charge (+) 0.00",
    "Fees/Other Debits (+) 0.00",
    "Late Charge (+) 0.00",
    "Payments/Other Credits (-) 0.00",
    "Sale Date Post Date Transaction Details Amount",
    "PREVIOUS STATEMENT BALANCE 0.00",
    "CARD NUMBER 1111-222233-33444",
    "08/29/26 08/30/26 Green Market Cafe 25.50",
    "SUBTOTAL 25.50",
    "TOTAL 25.50",
  ];
  const text = lines
    .map((line) => `(${line.replace(/[\\()]/gu, "\\$&")}) Tj T*`)
    .join("\n");
  const stream = `BT /F1 11 Tf 16 TL 40 750 Td\n${text}\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

for (const width of [320, 390]) {
  test(`groups mobile Categorize actions and keeps the editor within ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // Stub financial reads only; layout uses the real route, styles and workflow.
    await page.route("**/api/v1/users/me/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      if (path.endsWith("/spaces")) {
        body = [{
          id: "1", kind: "personal", status: "active", accessLevel: "write",
          members: [{ id: "10", name: "Ada Lovelace" }],
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        }];
      } else if (path.endsWith("/categories")) {
        body = [{
          id: "42", name: "Housing", description: null, color: "teal", isActive: true,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        }];
      } else if (path.endsWith("/category-rules")) {
        body = [];
      } else if (path.endsWith("/statement-imports")) {
        body = { items: [], nextCursor: null };
      } else {
        await route.continue();
        return;
      }
      await route.fulfill({ json: body });
    });

    await page.goto("/imports?spaceId=1");
    await expect(page.getByRole("heading", { name: "Upload your statement" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "layout-statement.pdf", mimeType: "application/pdf", buffer: createStatementPdf(),
    });
    const transactions = page.getByRole("list", { name: "Transactions to categorize" });
    await expect(transactions).toBeVisible();
    const transaction = transactions.getByRole("listitem");
    const edit = transaction.getByRole("button", { name: "Edit Green Market Cafe", exact: true });
    const exclude = transaction.getByRole("button", { name: "Exclude Green Market Cafe", exact: true });
    const category = transaction.getByRole("button", { name: "Edit Category for Green Market Cafe" });
    const description = transaction.getByText("Green Market Cafe", { exact: true });
    await expect(edit).toBeVisible();
    await expect(exclude).toBeVisible();

    // Compare visible controls, not CSS classes or incidental DOM containers.
    await expect.poll(async () => {
      const [transactionBox, descriptionBox, editBox, excludeBox, categoryBox] = await Promise.all([
        transaction.boundingBox(),
        description.boundingBox(),
        edit.boundingBox(),
        exclude.boundingBox(),
        category.boundingBox(),
      ]);
      if (!transactionBox || !descriptionBox || !editBox || !excludeBox || !categoryBox) return false;
      return Math.abs(editBox.y - descriptionBox.y) <= 1 &&
        Math.abs(excludeBox.y - categoryBox.y) <= 1 &&
        categoryBox.x + categoryBox.width <= excludeBox.x + 1 &&
        Math.abs(excludeBox.x + excludeBox.width - (transactionBox.x + transactionBox.width - 16)) <= 1;
    }).toBe(true);

    await category.click();
    const categoryEditor = page.getByRole("dialog", { name: "Edit Transaction" });
    const categoryInput = categoryEditor.getByRole("combobox", {
      name: "Category for Green Market Cafe",
    });
    await expect(categoryInput).toBeFocused();
    await expect.poll(() =>
      categoryInput.evaluate((element) => getComputedStyle(element).boxShadow),
    ).not.toBe("none");
    await categoryEditor.getByRole("button", { name: "Cancel", exact: true }).click();

    await edit.click();
    const editor = page.getByRole("dialog", { name: "Edit Transaction" });
    const date = editor.getByLabel("Date for Green Market Cafe", { exact: true });
    await expect(date).toBeVisible();
    await expect.poll(async () => {
      const [editorBox, dateBox] = await Promise.all([editor.boundingBox(), date.boundingBox()]);
      if (!editorBox || !dateBox) return false;
      return editorBox.x >= 0 && editorBox.x + editorBox.width <= width + 1 &&
        dateBox.x >= editorBox.x &&
        dateBox.x + dateBox.width <= editorBox.x + editorBox.width + 1;
    }).toBe(true);
    await expect.poll(() => editor.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await date.fill("2026-08-28");
    await expect(date).toHaveValue("2026-08-28");
  });
}

test("keeps recent Statement Import history inside its card on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("**/api/v1/users/me/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith("/spaces")) {
      body = [{
        id: "1", kind: "personal", status: "active", accessLevel: "write",
        members: [{ id: "10", name: "Ada Lovelace" }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }];
    } else if (path.endsWith("/categories")) {
      body = [{
        id: "42", name: "Housing", description: null, color: "teal", isActive: true,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }];
    } else if (path.endsWith("/category-rules")) {
      body = [];
    } else if (path.endsWith("/statement-imports")) {
      body = {
        items: [1, 2, 3].map((id) => ({
          id: String(id),
          fileName: `BDO-SOA-AMEX-EXPLORER-${id}-09172026.pdf`,
          statementDate: "2026-09-17",
          bank: "BDO",
          cardType: "AMEX",
          statementType: "credit_card",
          transactionHistoryStartDate: null,
          totalDebit: null,
          importedAt: "2026-09-18T00:00:00.000Z",
          importedByUserId: "10",
          transactionCount: "66",
        })),
        nextCursor: null,
      };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ json: body });
  });

  await page.goto("/imports?spaceId=1");
  const card = page.getByRole("region", {
    name: "Recent Committed Statement Imports",
  });
  await expect(card.getByRole("listitem")).toHaveCount(3);

  await expect.poll(async () => {
    const [cardBox, listBox] = await Promise.all([
      card.boundingBox(),
      card.getByRole("list").boundingBox(),
    ]);
    if (!cardBox || !listBox) return false;
    return listBox.y + listBox.height <= cardBox.y + cardBox.height - 1;
  }).toBe(true);
});
