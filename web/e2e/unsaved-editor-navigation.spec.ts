import { expect, test, type Page, type Route } from "@playwright/test";

const spaces = [
  {
    id: "1",
    kind: "personal",
    status: "active",
    accessLevel: "write",
    members: [{ id: "10", name: "Ada Lovelace" }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
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
  },
];

const housing = {
  id: "42",
  name: "Housing",
  description: "Home costs",
  color: "teal",
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const categorySummary = {
  period: "monthly",
  year: "2026",
  month: "09",
  categories: [
    {
      categoryId: housing.id,
      name: housing.name,
      isActive: true,
      totalAmount: "0.00",
      transactionCount: "0",
      budgetAmount: "200.00",
      remainingAmount: "200.00",
    },
  ],
  uncategorizedTotal: "0.00",
  uncategorizedCount: "0",
};

const categoryRules = {
  rules: [
    {
      id: "1",
      categoryId: housing.id,
      pattern: "Rent",
      matchType: "exact",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  revision: "1",
};

async function installFinancialFixtures(page: Page) {
  await page.route("**/api/v1/users/me/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const path = new URL(request.url()).pathname;
    if (path.endsWith("/spaces")) {
      await fulfillJson(route, spaces);
      return;
    }
    if (path.includes("/category-summaries")) {
      await fulfillJson(route, categorySummary);
      return;
    }
    if (path.endsWith("/category-rules")) {
      await fulfillJson(route, categoryRules);
      return;
    }
    if (path.endsWith(`/categories/${housing.id}/budget`)) {
      await fulfillJson(route, {
        id: "1",
        categoryId: housing.id,
        amount: "200.00",
        period: "monthly",
        updatedAt: "2026-09-01T00:00:00.000Z",
      });
      return;
    }
    if (path.endsWith("/categories")) {
      await fulfillJson(route, [housing]);
      return;
    }
    if (
      path.endsWith("/transactions") ||
      path.endsWith("/transactions/history")
    ) {
      await fulfillJson(route, { items: [], nextCursor: null });
      return;
    }

    await route.continue();
  });
}

async function switchToSharedSpace(page: Page) {
  await page.getByRole("button", { name: /Active Space/u }).click();
  await page
    .getByRole("menuitemradio", {
      name: /Shared.*Ada Lovelace.*Grace Hopper/u,
    })
    .click();
}

async function switchToPersonalSpace(page: Page) {
  await page.getByRole("button", { name: /Active Space/u }).click();
  await page
    .getByRole("menuitemradio", { name: /Personal.*Ada Lovelace/u })
    .click();
}

async function leaveThroughGuard(page: Page, label: string) {
  await page
    .getByRole("dialog", { name: `Leave ${label} editor?` })
    .getByRole("button", { name: "Discard changes" })
    .click();
}

test("guards Category, Budget, and Category Rule editors during Space switching", async ({
  page,
}) => {
  await installFinancialFixtures(page);

  await page.goto("/categories?spaceId=1");
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Housing" }).click();
  const budgetInput = page.getByRole("textbox", {
    name: "Monthly Budget for Housing",
  });
  await expect(budgetInput).toBeVisible();
  await budgetInput.fill("175.00");
  await budgetInput.focus();
  await switchToSharedSpace(page);
  await expect(
    page.getByRole("dialog", { name: "Leave Category editor?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(budgetInput).toBeFocused();
  await expect(budgetInput).toHaveValue("175.00");
  await switchToSharedSpace(page);
  await leaveThroughGuard(page, "Category");
  await expect(page).toHaveURL(/\/categories\?spaceId=99$/u);

  await page.goto("/categories?spaceId=1");
  await switchToPersonalSpace(page);
  await page.getByRole("button", { name: "New Category" }).click();
  const newCategoryDialog = page.getByRole("dialog", { name: "New Category" });
  const newCategoryName = newCategoryDialog.getByRole("textbox", {
    name: /^Category name/u,
  });
  await newCategoryName.fill("Unsaved Category");
  await newCategoryName.focus();
  await switchToSharedSpace(page);
  await expect(
    page.getByRole("dialog", { name: "Leave Category editor?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(newCategoryName).toBeFocused();
  await expect(newCategoryName).toHaveValue("Unsaved Category");
  await switchToSharedSpace(page);
  await leaveThroughGuard(page, "Category");
  await expect(page).toHaveURL(/\/categories\?spaceId=99$/u);

  await page.goto("/categories?spaceId=1");
  await switchToPersonalSpace(page);
  await page
    .getByRole("button", { name: "Category Rules for Housing" })
    .click();
  const exactPattern = page.getByRole("textbox", {
    name: "Exact pattern 1",
  });
  await expect(exactPattern).toBeVisible();
  await exactPattern.fill("Unsaved Rent");
  await exactPattern.focus();
  await switchToSharedSpace(page);
  await expect(
    page.getByRole("dialog", { name: "Leave Category Rule editor?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(exactPattern).toBeFocused();
  await expect(exactPattern).toHaveValue("Unsaved Rent");
  await switchToSharedSpace(page);
  await leaveThroughGuard(page, "Category Rule");
  await expect(page).toHaveURL(/\/categories\?spaceId=99$/u);
});

test("guards the Transaction editor during a real Space switch", async ({
  page,
}) => {
  await installFinancialFixtures(page);

  await page.goto("/transactions?spaceId=1");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record Transaction" }).click();
  const transactionDialog = page.getByRole("dialog", {
    name: "Record Transaction",
  });
  const description = transactionDialog.getByLabel("Description");
  await description.fill("Unsaved dinner");
  await description.focus();
  await switchToSharedSpace(page);
  await expect(
    page.getByRole("dialog", { name: "Leave Transaction editor?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(description).toBeFocused();
  await expect(description).toHaveValue("Unsaved dinner");
  await switchToSharedSpace(page);
  await leaveThroughGuard(page, "Transaction");
  await expect(page).toHaveURL(/\/transactions\?spaceId=99$/u);
});

test("guards ordinary primary navigation while a Transaction editor is dirty", async ({
  page,
}) => {
  await installFinancialFixtures(page);

  await page.goto("/transactions?spaceId=1");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record Transaction" }).click();
  const transactionDialog = page.getByRole("dialog", {
    name: "Record Transaction",
  });
  const description = transactionDialog.getByLabel("Description");
  await description.fill("Unsaved dinner");
  await description.focus();

  await page.getByRole("link", { name: "Categories" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Leave Transaction editor?" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/transactions(?:\?spaceId=1)?$/u);
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(description).toBeFocused();
  await expect(description).toHaveValue("Unsaved dinner");

  await page.getByRole("link", { name: "Categories" }).first().click();
  await leaveThroughGuard(page, "Transaction");
  await expect(page).toHaveURL(/\/categories(?:\?spaceId=1)?$/u);
});

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
