import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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
  await expect(
    page.getByText("Food & Drink", { exact: true }).first(),
  ).toBeVisible();
});

test("persists a Transaction through the real API after a browser reload", async ({
  page,
}) => {
  const apiBaseUrl = process.env.SPENDEAZY_E2E_API_BASE_URL;
  const sessionToken = process.env.VITE_LOCAL_TEST_SESSION_TOKEN;
  const purchaseDate = process.env.SPENDEAZY_E2E_TEST_DATE;
  if (!apiBaseUrl || !sessionToken || !purchaseDate) {
    throw new Error(
      "The local test API URL, session token, and controlled test date are required for persistence E2E coverage.",
    );
  }

  await page.goto("/transactions");
  await expect(page.getByTestId("local-test-panel")).toContainText(
    "LOCAL TEST",
  );
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();

  const description = "Browser persistence fixture";
  const transaction = await page.evaluate(
    async ({
      apiBaseUrl: baseUrl,
      sessionToken: token,
      description: label,
      purchaseDate: date,
    }) => {
      const response = await fetch(`${baseUrl}/api/v1/users/me/transactions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseDate: date,
          description: label,
          amount: "123.45",
          categoryId: null,
        }),
      });

      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    {
      apiBaseUrl,
      sessionToken,
      description,
      purchaseDate,
    },
  );

  expect(transaction.status).toBe(201);
  expect(readTransactionDescription(transaction.body)).toBe(description);

  await page.reload();
  await expect(
    page.getByText(description, { exact: true }).first(),
  ).toBeVisible();
});

function readTransactionDescription(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The created Transaction response was not an object.");
  }

  const description = (value as { description?: unknown }).description;
  if (typeof description !== "string") {
    throw new Error("The created Transaction response had no description.");
  }

  return description;
}
