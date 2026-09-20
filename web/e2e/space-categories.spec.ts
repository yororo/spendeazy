import { expect, test } from "@playwright/test";

const sharedSpace = {
  id: "99",
  kind: "shared",
  status: "active",
  accessLevel: "write",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const sharedCategory = {
  id: "900",
  name: "Shared Groceries",
  description: null,
  color: "teal",
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

test("switches the Categories browser view to a seeded Shared Space", async ({
  page,
}) => {
  await page.route("**/api/v1/users/me/spaces", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([sharedSpace]),
    });
  });
  await page.route(
    "**/api/v1/users/me/spaces/99/categories",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([sharedCategory]),
      });
    },
  );
  await page.route(
    "**/api/v1/users/me/spaces/99/category-summaries**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          period: "monthly",
          year: "2026",
          month: "09",
          categories: [
            {
              categoryId: sharedCategory.id,
              name: sharedCategory.name,
              isActive: true,
              totalAmount: "0.00",
              transactionCount: "0",
              budgetAmount: null,
              remainingAmount: null,
            },
          ],
          uncategorizedTotal: "0.00",
          uncategorizedCount: "0",
        }),
      });
    },
  );

  await page.goto("/categories");
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Active Space" })
    .getByRole("button", { name: "Shared" })
    .click();

  await expect(page).toHaveURL(/\/categories\?spaceId=99$/u);
  await expect(
    page
      .getByRole("table", { name: "Desktop Budget Categories" })
      .getByText("Shared Groceries", { exact: true }),
  ).toBeVisible();
});
