import { expect, test } from "@playwright/test";

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
  {
    id: "77",
    kind: "shared",
    status: "archived",
    accessLevel: "read",
    members: [
      { id: "10", name: "Ada Lovelace" },
      { id: "12", name: "Deleted user" },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

test("shows archived Shared history separately and read-only", async ({
  page,
}) => {
  await page.route("**/api/v1/users/me/spaces", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(spaces),
    });
  });

  await page.route(
    "**/api/v1/users/me/spaces/77/categories",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );
  await page.route(
    "**/api/v1/users/me/spaces/77/category-summaries**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          period: "monthly",
          year: "2026",
          month: "09",
          categories: [],
          uncategorizedTotal: "45.00",
          uncategorizedCount: "1",
        }),
      });
    },
  );
  await page.route(
    "**/api/v1/users/me/spaces/77/transactions**",
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/activity")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "activity-701",
              transactionId: "701",
              type: "deleted",
              actorUserId: "12",
              occurredAt: "2026-09-05T00:00:00.000Z",
            },
          ]),
        });
        return;
      }

      const deleted = pathname.endsWith("/history");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: deleted ? "701" : "700",
              categoryId: null,
              purchaseDate: "2026-09-04",
              description: deleted ? "Deleted dinner" : "Archived dinner",
              amount: "45.00",
              source: "manual",
              statementImportId: null,
              updatedAt: "2026-09-04T00:00:00.000Z",
              addedByUserId: "12",
              ...(deleted ? { deletedAt: "2026-09-05T00:00:00.000Z" } : {}),
            },
          ],
          nextCursor: null,
        }),
      });
    },
  );

  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Space history" }),
  ).toBeVisible();
  await expect(
    page.getByText("Former members: Ada Lovelace and Deleted user"),
  ).toBeVisible();
  await expect(page.getByText("Read-only history").first()).toBeVisible();

  await page
    .getByRole("button", { name: /Active Space/u })
    .click();
  await expect(
    page.getByRole("menuitemradio", {
      name: /Shared.*Ada Lovelace.*Grace Hopper/u,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", {
      name: /Deleted user/u,
    }),
  ).toHaveCount(0);

  await page
    .getByRole("link", {
      name: /View history for Shared.*Deleted user/u,
    })
    .click();
  await expect(page).toHaveURL(/\/history\?spaceId=77$/u);
  await expect(
    page.getByRole("heading", { name: "Archived Space history" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "All transactions" })
      .getByText("Archived dinner", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "All transactions" })
      .getByText("Added by Deleted user"),
  ).toBeVisible();
  await expect(page.getByText("Read-only history").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Edit Archived dinner/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete Archived dinner/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Deleted Transactions" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Deleted transactions" })
      .getByText("Deleted dinner", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Edit Deleted dinner/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Delete Deleted dinner/u }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "View activity for Deleted dinner" })
    .click();
  await expect(page.getByText("Deleted by Deleted user")).toBeVisible();
});
