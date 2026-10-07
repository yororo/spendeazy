import { test } from "./preferences-fixture";
import { expect, type Page, type Route } from "@playwright/test";
import { createNewLocalTestUser, requireEnvironment } from "./test-helpers";
import { changeTheme, navigateSpending } from "./theme-helpers";

for (const width of [320, 390, 1440]) {
  test(`Theme switching preserves and submits real financial drafts at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: requireEnvironment("SPENDEAZY_E2E_TEST_CLOCK") });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/categories");
    await createNewLocalTestUser(page);
    await expect(page.getByTestId("local-test-active-user")).toContainText("Fresh Local User");
    await expect(page.getByRole("heading", { name: "Budget overview" })).toBeVisible();
    await page.getByLabel("Reporting period", { exact: true }).fill("2026-08");
    await page.getByRole("button", { name: "New Category", exact: true }).click();
    const create = page.getByRole("dialog", { name: "New Category", exact: true });
    const name = create.getByRole("textbox", { name: /^Category name/ });
    const writes: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.method());
    });
    const preserve = async () => {
      const url = page.url();
      await page.locator("[data-page-scroll-host]").evaluate(element => { element.scrollTop = 200; });
      const scroll = await page.locator("[data-page-scroll-host]").evaluate(element => element.scrollTop);
      const count = writes.length;
      for (const theme of ["Playful", "Technical"] as const) {
        await changeTheme(page, theme, "Dark");
        await expect(page).toHaveURL(url);
        await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("2026-08");
        expect(Math.abs(await page.locator("[data-page-scroll-host]").evaluate(element => element.scrollTop) - scroll)).toBeLessThanOrEqual(1);
        expect(writes).toHaveLength(count);
      }
    };
    await name.fill(" ");
    await create.getByRole("button", { name: "Save Category", exact: true }).click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await preserve();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await name.fill("Fictional theme drafts");
    await preserve();
    await expect(name).toHaveValue("Fictional theme drafts");
    await create.getByRole("button", { name: "Save Category", exact: true }).click();
    await expect(create).toHaveCount(0);
    await page.getByRole("button", { name: "Edit Fictional theme drafts", exact: true }).click();
    const budget = page.getByRole("textbox", { name: "Monthly Budget for Fictional theme drafts", exact: true });
    await budget.fill("-1");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(budget).toHaveAttribute("aria-invalid", "true");
    await preserve();
    await expect(budget).toHaveValue("-1");
    await expect(budget).toHaveAttribute("aria-invalid", "true");
    await budget.fill("200.00");
    await preserve();
    await expect(budget).toHaveValue("200.00");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(budget).toHaveCount(0);
    await page.getByRole("button", { name: "Category Rules for Fictional theme drafts" }).click();
    await page.getByRole("button", { name: "Add Exact Rule", exact: true }).click();
    const pattern = page.getByRole("textbox", { name: "Exact pattern 1", exact: true });
    await page.getByRole("button", { name: "Save Rules", exact: true }).click();
    await expect(pattern).toHaveAttribute("aria-invalid", "true");
    await preserve();
    await expect(pattern).toHaveAttribute("aria-invalid", "true");
    await pattern.fill("Fictional dinner");
    await preserve();
    await expect(pattern).toHaveValue("Fictional dinner");
    await page.getByRole("button", { name: "Save Rules", exact: true }).click();
    await expect(page.getByText("Category Rules saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await changeTheme(page, "Playful", "Light");
    if (width < 768) await page.getByRole("button", { name: "More actions for Fictional theme drafts", exact: true }).click();
    await page.getByRole(width < 768 ? "menuitem" : "button", { name: "Deactivate Fictional theme drafts", exact: true }).click();
    await page.getByRole("dialog", { name: "Deactivate Fictional theme drafts?", exact: true })
      .getByRole("button", { name: "Deactivate Category", exact: true }).click();
    await page.getByRole("checkbox", { name: "Show inactive Categories", exact: true }).check();
    await page.getByRole("button", { name: "Reactivate Fictional theme drafts", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reactivate Fictional theme drafts", exact: true })).toHaveCount(0);
    await navigateSpending(page, "Transactions");
    await expect(page.getByRole("heading", { name: "Your spending", exact: true })).toBeVisible();
    const search = page.getByRole("textbox", { name: width < 768 ? "Search Transactions" : "Search descriptions", exact: true }).filter({ visible: true }).first();
    await search.fill("Fictional");
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Record Transaction", exact: true }).click();
    const transaction = page.getByRole("dialog", { name: "Record Transaction", exact: true });
    await transaction.getByLabel("Description", { exact: true }).fill("Fictional dinner");
    await transaction.getByLabel("Amount", { exact: true }).fill("123.4");
    await transaction.getByLabel("Purchase date", { exact: true }).fill("2026-08-15");
    await transaction.getByRole("combobox", { name: "Category", exact: true }).click();
    await page.getByRole("option", { name: "Fictional theme drafts", exact: true }).click();
    await transaction.getByRole("button", { name: "Record Transaction", exact: true }).click();
    expect(await transaction.getByLabel("Amount", { exact: true }).evaluate(element => element instanceof HTMLInputElement && element.validity.patternMismatch)).toBe(true);
    await preserve();
    expect(await transaction.getByLabel("Amount", { exact: true }).evaluate(element => element instanceof HTMLInputElement && element.validity.patternMismatch)).toBe(true);
    await transaction.getByLabel("Amount", { exact: true }).fill("123.45");
    await preserve();
    await expect(search).toHaveValue("Fictional");
    await expect(transaction.getByLabel("Description", { exact: true })).toHaveValue("Fictional dinner");
    await expect(transaction.getByLabel("Amount", { exact: true })).toHaveValue("123.45");
    await expect(transaction.getByLabel("Purchase date", { exact: true })).toHaveValue("2026-08-15");
    await expect(transaction.getByRole("combobox")).toContainText("Fictional theme drafts");
    await changeTheme(page, "Playful", "Light");
    const recorded = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/transactions"));
    await transaction.getByRole("button", { name: "Record Transaction", exact: true }).click();
    expect(await (await recorded).json()).toMatchObject({ amount: "123.45", purchaseDate: "2026-08-15", description: "Fictional dinner" });
    await expect(transaction).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Transaction summary" })).toContainText("₱123.45");
    const action = async (desktopName: string, mobileName: string) => {
      if (width < 768) {
        await page.getByRole("button", { name: "More actions for Fictional dinner", exact: true }).click();
        await page.getByRole("menuitem", { name: mobileName, exact: true }).click();
      } else await page.getByRole("button", { name: desktopName, exact: true }).click();
    };
    await action("View activity for Fictional dinner", "Activity");
    await expect(page.getByRole("dialog")).toContainText("Fictional dinner");
    await page.keyboard.press("Escape");
    await action("Edit Fictional dinner", "Edit");
    const edit = page.getByRole("dialog", { name: "Edit Transaction", exact: true });
    await edit.getByLabel("Amount", { exact: true }).fill("124.45");
    await preserve();
    await expect(edit.getByLabel("Amount", { exact: true })).toHaveValue("124.45");
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await action("Delete Fictional dinner", "Delete");
    await page.getByRole("dialog", { name: "Delete Transaction?", exact: true }).getByRole("button", { name: "Delete Transaction", exact: true }).click();
    await expect(page.getByRole("region", { name: "Transaction summary" })).toContainText("₱0.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

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
      name: "Shared",
    })
    .click();
}

async function switchToPersonalSpace(page: Page) {
  await page.getByRole("button", { name: /Active Space/u }).click();
  await page
    .getByRole("menuitemradio", { name: "Personal" })
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

  await page.getByRole("link", { name: "Budgets" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Leave Transaction editor?" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/transactions(?:\?spaceId=1)?$/u);
  await page.getByRole("button", { name: "Stay in editor" }).click();
  await expect(description).toBeFocused();
  await expect(description).toHaveValue("Unsaved dinner");

  await page.getByRole("link", { name: "Budgets" }).first().click();
  await leaveThroughGuard(page, "Transaction");
  await expect(page).toHaveURL(/\/categories(?:\?spaceId=1)?$/u);
});

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
