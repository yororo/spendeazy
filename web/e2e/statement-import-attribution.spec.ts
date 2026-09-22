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

test("shows each Shared member as the importer in recent history", async ({
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
    "**/api/v1/users/me/spaces/99/category-rules",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );
  await page.route(
    "**/api/v1/users/me/spaces/99/statement-imports**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "101",
              fileName: "ada.pdf",
              statementDate: "2026-08-31",
              bank: "BDO",
              cardType: "AMEX",
              importedAt: "2026-09-01T00:00:00.000Z",
              importedByUserId: "10",
              transactionCount: "1",
            },
            {
              id: "100",
              fileName: "grace.pdf",
              statementDate: "2026-08-30",
              bank: "BDO",
              cardType: "AMEX",
              importedAt: "2026-08-31T00:00:00.000Z",
              importedByUserId: "11",
              transactionCount: "2",
            },
          ],
          nextCursor: null,
        }),
      });
    },
  );

  await page.goto("/imports?spaceId=99");
  await expect(
    page.getByRole("heading", { name: "Upload your statement" }),
  ).toBeVisible();
  await expect(page.getByText("Imported by Ada Lovelace")).toBeVisible();
  await expect(page.getByText("Imported by Grace Hopper")).toBeVisible();
});
