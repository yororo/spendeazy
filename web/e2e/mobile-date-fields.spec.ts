import { expect, test, type Locator } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

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
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function expectMobileDateField(
  field: Locator,
  container: Locator,
) {
  const wrapper = field.locator("xpath=..");
  const icon = wrapper.locator('[data-slot="date-input-icon"]');
  await expect(icon).toBeVisible();
  await expect
    .poll(() => field.evaluate((element) => getComputedStyle(element).appearance))
    .toBe("none");

  await expect
    .poll(async () => {
      const [fieldBox, containerBox] = await Promise.all([
        field.boundingBox(),
        container.boundingBox(),
      ]);
      const wrapperBox = await wrapper.boundingBox();
      if (!fieldBox || !wrapperBox || !containerBox) return false;
      return (
        fieldBox.x >= wrapperBox.x &&
        fieldBox.x + fieldBox.width <= wrapperBox.x + wrapperBox.width + 1 &&
        fieldBox.x >= containerBox.x &&
        fieldBox.x + fieldBox.width <= containerBox.x + containerBox.width + 1
      );
    })
    .toBe(true);
}

test("keeps mobile date fields contained and shows their picker affordance", async ({
  page,
}) => {
  await page.goto("/transactions?spaceId=1");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Record Transaction" }).click();
  const transactionDialog = page.getByRole("dialog", {
    name: "Record Transaction",
  });
  await expectMobileDateField(
    transactionDialog.getByLabel("Purchase date"),
    transactionDialog,
  );
  await transactionDialog.getByRole("button", { name: "Cancel" }).click();

  await page
    .getByRole("list", { name: "All transactions" })
    .getByRole("button", { name: "Edit" })
    .first()
    .click();
  const editDialog = page.getByRole("dialog", { name: "Edit Transaction" });
  await expectMobileDateField(
    editDialog.getByLabel("Purchase date"),
    editDialog,
  );
  await editDialog.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/imports?spaceId=1");
  await expect(
    page.getByRole("heading", { name: "Upload your statement" }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "mobile-date-fields.pdf",
    mimeType: "application/pdf",
    buffer: createStatementPdf(),
  });

  const transactions = page.getByRole("list", {
    name: "Transactions to categorize",
  });
  await expect(transactions).toBeVisible();

  await page.getByRole("button", { name: "Filter Transactions" }).click();
  const filterDialog = page.getByRole("dialog", {
    name: "Filter Transactions",
  });
  await expectMobileDateField(filterDialog.getByLabel("From"), filterDialog);
  await expectMobileDateField(filterDialog.getByLabel("To"), filterDialog);
  await filterDialog.getByRole("button", { name: "Close" }).click();

  await transactions
    .getByRole("button", { name: "Edit Green Market Cafe", exact: true })
    .click();
  const categorizeDialog = page.getByRole("dialog", {
    name: "Edit Transaction",
  });
  await expectMobileDateField(
    categorizeDialog.getByLabel("Date for Green Market Cafe"),
    categorizeDialog,
  );
});
