import { expect, test } from "@playwright/test";

const personalSpace = {
  id: "1",
  kind: "personal",
  status: "active",
  accessLevel: "write",
  members: [{ id: "10", name: "Ada Lovelace" }],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const sharedSpace = {
  id: "99",
  kind: "shared",
  status: "active",
  accessLevel: "write",
  members: [
    { id: "10", name: "Ada Lovelace" },
    { id: "11", name: "Grace Hopper" },
  ],
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
      body: JSON.stringify([personalSpace, sharedSpace]),
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
  await page.getByRole("button", { name: /Active Space/u }).click();
  await page
    .getByRole("menuitemradio", {
      name: "Shared",
    })
    .click();

  await expect(page).toHaveURL(/\/categories\?spaceId=99$/u);
  await expect(
    page
      .getByRole("table", { name: "Desktop Budget Categories" })
      .getByText("Shared Groceries", { exact: true }),
  ).toBeVisible();
});
