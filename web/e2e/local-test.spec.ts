import { expect, test } from "@playwright/test";

test("provisions the fixed fictional User with Default Categories", async ({
  page,
}) => {
  await page.goto("/categories");

  await expect(page.getByTestId("local-test-panel")).toContainText(
    "LOCAL TEST",
  );
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();
  await expect(page.getByText("Food & Drink", { exact: true }).first()).toBeVisible();
});
