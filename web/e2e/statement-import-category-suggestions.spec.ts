import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  authorizationHeaders,
  createNewLocalTestUser,
  isRecord,
  requireEnvironment,
} from "./test-helpers";

const testClock =
  process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z";
const suggestionPath =
  "/api/v1/users/me/spaces/{spaceId}/statement-imports/category-suggestions";
const suggestedCategoryName = "E2E Suggested Category";
const fallbackCategoryName = "E2E Fallback Category";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: testClock });
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test("does not commit a Category Suggestion selected only in the unsaved editor", async ({
  page,
  request,
}) => {
  const spaceContext = await createFreshUserSpaceContext(
    page,
    request,
    requireEnvironment("SPENDEAZY_E2E_API_BASE_URL"),
  );
  const { apiBaseUrl, token: userToken, spaceId } = spaceContext;
  const suggestedCategoryId = await createCategory(
    spaceContext,
    suggestedCategoryName,
  );
  const suggestionResponse = await request.post(
    `${apiBaseUrl}${getCategorySuggestionPath(spaceId)}`,
    {
      headers: authorizationHeaders(userToken),
      data: { description: "Payment to Cafe Preview" },
    },
  );
  expect(suggestionResponse.status()).toBe(200);
  expect(await suggestionResponse.json()).toEqual({
    suggestions: [
      {
        categoryId: suggestedCategoryId,
        categoryName: suggestedCategoryName,
      },
    ],
  });
  const description = "Payment to Cafe Preview";
  const fileName = "category-suggestion-unsaved.pdf";
  const browserSuggestionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/statement-imports/category-suggestions"),
    { timeout: 10_000 },
  );

  await page.getByRole("link", { name: "Imports" }).click();
  await uploadStatement(
    page,
    fileName,
    [
      {
        date: "2026-09-02",
        time: "09:00 AM",
        description,
        reference: "910001",
        debit: "12.00",
        balance: "88.00",
      },
    ],
    {
      startingBalance: "100.00",
      endingBalance: "88.00",
      totalDebit: "12.00",
      totalCredit: "0.00",
    },
  );
  const browserSuggestion = await browserSuggestionResponse;
  expect(browserSuggestion.status()).toBe(200);
  expect(await browserSuggestion.json()).toEqual({
    suggestions: [
      {
        categoryId: suggestedCategoryId,
        categoryName: suggestedCategoryName,
      },
    ],
  });

  await expect(
    page.getByRole("button", {
      name: `Suggestions available for ${description}`,
    }),
  ).toBeVisible();
  const table = page.getByRole("table").first();
  const transactionRow = table
    .getByRole("row")
    .filter({ hasText: description });
  await expect(transactionRow).toContainText("Unmapped");

  await page
    .getByRole("button", {
      name: `Suggestions available for ${description}`,
    })
    .click();
  const suggestedCategory = page.getByRole("button", {
    name: `Use suggested Category: ${suggestedCategoryName}`,
  });
  await expect(suggestedCategory).toBeVisible();
  await suggestedCategory.click();
  await expect(
    page.getByRole("combobox", { name: `Category for ${description}` }),
  ).toContainText(suggestedCategoryName);
  await page
    .getByRole("button", { name: `Cancel changes to ${description}` })
    .click();

  await expect(transactionRow).toContainText("Unmapped");
  await expect(
    page.getByRole("button", { name: "Review 1 Transactions" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to Upload" }).click();
  await expect(
    page.getByRole("heading", { name: "Leave Statement Import?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave Categorize" }).click();
  await expect(
    page.getByRole("heading", { name: "Upload your statement" }),
  ).toBeVisible();

  const importsResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/statement-imports`,
    { headers: authorizationHeaders(userToken) },
  );
  expect(importsResponse.status()).toBe(200);
  expect(
    readObjectsField(await importsResponse.json(), "items"),
  ).toHaveLength(0);

  const transactionsResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/transactions`,
    { headers: authorizationHeaders(userToken) },
  );
  expect(transactionsResponse.status()).toBe(200);
  expect(
    readObjectsField(await transactionsResponse.json(), "items"),
  ).toHaveLength(0);
});

test("commits saved Category Suggestions through Statement Import with Space isolation", async ({
  page,
  request,
  browser,
}) => {
  const spaceContext = await createFreshUserSpaceContext(
    page,
    request,
    requireEnvironment("SPENDEAZY_E2E_API_BASE_URL"),
  );
  const { apiBaseUrl, token: userToken, spaceId } = spaceContext;
  const suggestedCategoryId = await createCategory(
    spaceContext,
    suggestedCategoryName,
  );
  const fallbackCategoryId = await createCategory(
    spaceContext,
    fallbackCategoryName,
  );
  const ruleCategoryId = await createCategory(
    spaceContext,
    "E2E Rule Category",
  );
  const ambiguousCategoryOneId = await createCategory(
    spaceContext,
    "E2E Ambiguous Category One",
  );
  const ambiguousCategoryTwoId = await createCategory(
    spaceContext,
    "E2E Ambiguous Category Two",
  );

  await createCategoryRule(spaceContext, {
    categoryId: ruleCategoryId,
    pattern: "Payment to Cafe Rule Shop",
    matchType: "exact",
  });
  await createCategoryRule(spaceContext, {
    categoryId: ambiguousCategoryOneId,
    pattern: "Cafe Ambiguous",
    matchType: "contains",
  });
  await createCategoryRule(spaceContext, {
    categoryId: ambiguousCategoryTwoId,
    pattern: "Ambiguous Shop",
    matchType: "contains",
  });

  await expectCategorySuggestionContract(request, apiBaseUrl);
  const directSuggestionResponse = await request.post(
    `${apiBaseUrl}${getCategorySuggestionPath(spaceId)}`,
    {
      headers: authorizationHeaders(userToken),
      data: { description: "Payment to Cafe Moon" },
    },
  );
  expect(directSuggestionResponse.status()).toBe(200);
  expect(await directSuggestionResponse.json()).toEqual({
    suggestions: [
      {
        categoryId: suggestedCategoryId,
        categoryName: suggestedCategoryName,
      },
    ],
  });

  const otherUserContext = await browser.newContext();
  try {
    const otherUserPage = await otherUserContext.newPage();
    await otherUserPage.clock.install({ time: testClock });
    const otherSpaceContext = await createFreshUserSpaceContext(
      otherUserPage,
      request,
      apiBaseUrl,
    );
    const { token: otherUserToken, spaceId: otherSpaceId } = otherSpaceContext;
    const otherSuggestedCategoryId = await createCategory(
      otherSpaceContext,
      suggestedCategoryName,
    );
    expect(otherSpaceId).not.toBe(spaceId);
    expect(otherSuggestedCategoryId).not.toBe(suggestedCategoryId);

    const crossSpaceSuggestionResponse = await request.post(
      `${apiBaseUrl}${getCategorySuggestionPath(spaceId)}`,
      {
        headers: authorizationHeaders(otherUserToken),
        data: { description: "Payment to Cafe Moon" },
      },
    );
    expect(crossSpaceSuggestionResponse.status()).toBe(404);
  } finally {
    await otherUserContext.close();
  }

  const suggestionRequests: string[] = [];
  const categorySuggestionUrl = new URL(apiBaseUrl);
  const categorySuggestionRequestPath = getCategorySuggestionPath(spaceId);
  page.on("request", (browserRequest) => {
    const requestUrl = new URL(browserRequest.url());
    if (
      browserRequest.method() !== "POST" ||
      requestUrl.origin !== categorySuggestionUrl.origin ||
      requestUrl.pathname !== categorySuggestionRequestPath
    ) {
      return;
    }

    const body = readRecord(browserRequest.postDataJSON(), "suggestion request");
    if (typeof body.description === "string") {
      suggestionRequests.push(body.description);
    }
  });

  const suggestedDescription = "Payment to Cafe Moon";
  const unsavedDescription = "Payment to Cafe River";
  const unavailableDescription = "Payment to Cafe Local Shop";
  const slowDescription = "Payment to Cafe Slow Shop";
  const ruleDescription = "Payment to Cafe Rule Shop";
  const ambiguousDescription = "Refund from Cafe Ambiguous Shop";
  const fileName = "category-suggestion-accepted.pdf";

  await page.getByRole("link", { name: "Imports" }).click();
  await uploadStatement(
    page,
    fileName,
    [
      {
        date: "2026-09-02",
        time: "09:00 AM",
        description: suggestedDescription,
        reference: "910001",
        debit: "10.00",
        balance: "190.00",
      },
      {
        date: "2026-09-02",
        time: "09:05 AM",
        description: unsavedDescription,
        reference: "910002",
        debit: "12.00",
        balance: "178.00",
      },
      {
        date: "2026-09-02",
        time: "09:10 AM",
        description: unavailableDescription,
        reference: "910003",
        debit: "18.00",
        balance: "160.00",
      },
      {
        date: "2026-09-02",
        time: "09:15 AM",
        description: slowDescription,
        reference: "910004",
        debit: "5.00",
        balance: "155.00",
      },
      {
        date: "2026-09-02",
        time: "09:20 AM",
        description: ruleDescription,
        reference: "910005",
        debit: "15.00",
        balance: "140.00",
      },
      {
        date: "2026-09-02",
        time: "09:25 AM",
        description: ambiguousDescription,
        reference: "910006",
        debit: "20.00",
        balance: "160.00",
      },
    ],
    {
      startingBalance: "200.00",
      endingBalance: "160.00",
      totalDebit: "60.00",
      totalCredit: "20.00",
    },
  );

  const table = page.getByRole("table").first();
  const suggestedRow = table
    .getByRole("row")
    .filter({ hasText: suggestedDescription });
  await expect(suggestedRow).toContainText("Unmapped");
  await page
    .getByRole("button", {
      name: `Suggestions available for ${suggestedDescription}`,
    })
    .click();
  await page
    .getByRole("button", {
      name: `Use suggested Category: ${suggestedCategoryName}`,
    })
    .click();
  await page
    .getByRole("button", { name: `Save changes to ${suggestedDescription}` })
    .click();
  await expect(suggestedRow).toContainText(suggestedCategoryName);
  await expect(suggestedRow).toContainText("Manual");

  const unsavedRow = table
    .getByRole("row")
    .filter({ hasText: unsavedDescription });
  await page
    .getByRole("button", {
      name: `Suggestions available for ${unsavedDescription}`,
    })
    .click();
  await page
    .getByRole("button", {
      name: `Use suggested Category: ${suggestedCategoryName}`,
    })
    .click();
  await page
    .getByRole("button", { name: `Cancel changes to ${unsavedDescription}` })
    .click();
  await expect(unsavedRow).toContainText("Unmapped");

  await page
    .getByRole("button", { name: `Edit ${unsavedDescription}` })
    .click();
  await selectCategory(page, unsavedDescription, fallbackCategoryName);
  await page
    .getByRole("button", { name: `Save changes to ${unsavedDescription}` })
    .click();
  await expect(unsavedRow).toContainText(fallbackCategoryName);
  await expect(unsavedRow).toContainText("Manual");

  await page
    .getByRole("button", { name: `Edit ${unavailableDescription}` })
    .click();
  await expect(
    page.getByText(
      "No Category Suggestion available. Choose a Category from the list.",
    ),
  ).toBeVisible();
  await selectCategory(page, unavailableDescription, fallbackCategoryName);
  await page
    .getByRole("button", { name: `Save changes to ${unavailableDescription}` })
    .click();

  const slowRow = table.getByRole("row").filter({ hasText: slowDescription });
  await page
    .getByRole("button", { name: `Edit ${slowDescription}` })
    .click();
  await expect(
    page.getByText("Checking for a Category Suggestion…"),
  ).toBeVisible();
  await selectCategory(page, slowDescription, fallbackCategoryName);
  await page
    .getByRole("button", { name: `Save changes to ${slowDescription}` })
    .click();
  await expect(slowRow).toContainText(fallbackCategoryName);
  await expect(slowRow).toContainText("Manual");

  const ruleRow = table.getByRole("row").filter({ hasText: ruleDescription });
  await expect(ruleRow).toContainText("E2E Rule Category");
  await expect(ruleRow).toContainText("Rule");
  const ambiguousRow = table
    .getByRole("row")
    .filter({ hasText: ambiguousDescription });
  await expect(ambiguousRow).toContainText("Ambiguous");
  await expect(ambiguousRow).toContainText("Excluded");

  await expect(
    page.getByRole("button", { name: "Review 5 Transactions" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Review 5 Transactions" }).click();
  const reviewTable = page.getByRole("table").first();
  await expect(
    reviewTable.getByRole("row").filter({ hasText: suggestedDescription }),
  ).toContainText("Manual");
  await expect(
    reviewTable.getByRole("row").filter({ hasText: ruleDescription }),
  ).toContainText("Rule");
  await expect(
    reviewTable.getByRole("row").filter({ hasText: unsavedDescription }),
  ).toContainText(fallbackCategoryName);
  await expect(
    reviewTable.getByRole("row").filter({ hasText: unavailableDescription }),
  ).toContainText(fallbackCategoryName);
  await expect(
    reviewTable.getByRole("row").filter({ hasText: slowDescription }),
  ).toContainText(fallbackCategoryName);

  await page.getByRole("button", { name: "Import 5 Transactions" }).click();
  await expect(
    page.getByRole("heading", { name: "Statement imported" }),
  ).toBeVisible();

  expect(suggestionRequests).toEqual(
    expect.arrayContaining([
      suggestedDescription,
      unsavedDescription,
      unavailableDescription,
      slowDescription,
    ]),
  );
  expect(suggestionRequests).not.toContain(ruleDescription);
  expect(suggestionRequests).not.toContain(ambiguousDescription);

  const importsResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/statement-imports`,
    { headers: authorizationHeaders(userToken) },
  );
  expect(importsResponse.status()).toBe(200);
  const committedImports = readObjectsField(
    await importsResponse.json(),
    "items",
  );
  expect(committedImports).toHaveLength(1);
  expect(committedImports[0]).not.toHaveProperty("suggestions");
  expect(committedImports[0]).not.toHaveProperty("categorySuggestion");
  expect(committedImports[0]).not.toHaveProperty("suggestionFeedback");

  const transactionsResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/transactions?pageSize=100`,
    { headers: authorizationHeaders(userToken) },
  );
  expect(transactionsResponse.status()).toBe(200);
  const committedTransactions = readObjectsField(
    await transactionsResponse.json(),
    "items",
  );
  expect(committedTransactions).toHaveLength(5);
  expect(
    findTransaction(committedTransactions, suggestedDescription),
  ).toMatchObject({
    categoryId: suggestedCategoryId,
  });
  expect(
    findTransaction(committedTransactions, unsavedDescription),
  ).toMatchObject({
    categoryId: fallbackCategoryId,
  });
  expect(
    findTransaction(committedTransactions, unavailableDescription),
  ).toMatchObject({
    categoryId: fallbackCategoryId,
  });
  expect(findTransaction(committedTransactions, slowDescription)).toMatchObject(
    {
      categoryId: fallbackCategoryId,
    },
  );
  expect(findTransaction(committedTransactions, ruleDescription)).toMatchObject(
    {
      categoryId: ruleCategoryId,
    },
  );
  expect(
    committedTransactions.some(
      (transaction) => transaction.description === ambiguousDescription,
    ),
  ).toBe(false);
  expect(
    committedTransactions.every(
      (transaction) =>
        !Object.hasOwn(transaction, "suggestion") &&
        !Object.hasOwn(transaction, "suggestionFeedback"),
    ),
  ).toBe(true);

  const categoryRulesResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/category-rules`,
    { headers: authorizationHeaders(userToken) },
  );
  expect(categoryRulesResponse.status()).toBe(200);
  const persistedRules = readObjectsField(
    await categoryRulesResponse.json(),
    "rules",
  );
  expect(persistedRules).toHaveLength(3);
  expect(
    persistedRules.map(({ categoryId, matchType, pattern }) => ({
      categoryId,
      matchType,
      pattern,
    })),
  ).toEqual(
    expect.arrayContaining([
      {
        categoryId: ruleCategoryId,
        matchType: "exact",
        pattern: "Payment to Cafe Rule Shop",
      },
      {
        categoryId: ambiguousCategoryOneId,
        matchType: "contains",
        pattern: "Cafe Ambiguous",
      },
      {
        categoryId: ambiguousCategoryTwoId,
        matchType: "contains",
        pattern: "Ambiguous Shop",
      },
    ]),
  );
});

for (const width of [320, 390, 1440]) {
  test(`explicit categorization preserves corrections and advances at ${width}px`, async ({ page, request }) => {
    const context = await createFreshUserSpaceContext(page, request, requireEnvironment("SPENDEAZY_E2E_API_BASE_URL"));
    const categoryId = await createCategory(context, suggestedCategoryName);
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("link", { name: "Imports", exact: true }).click();
    await uploadStatement(page, `explicit-assignment-${width}.pdf`, [
      { date: "2026-09-03", time: "09:00 AM", description: "Payment to First Cafe", reference: "920001", debit: "10.00", balance: "90.00" },
      { date: "2026-09-02", time: "09:00 AM", description: "Payment to Excluded Cafe", reference: "920002", debit: "20.00", balance: "70.00" },
      { date: "2026-09-01", time: "09:00 AM", description: "Payment to Last Cafe", reference: "920003", debit: "30.00", balance: "40.00" },
    ], { startingBalance: "100.00", endingBalance: "40.00", totalDebit: "60.00", totalCredit: "0.00" });
    await page.getByRole("button", { name: "Exclude Payment to Excluded Cafe", exact: true }).click();
    const search = page.getByRole("textbox", { name: width < 768 ? "Search Transactions" : "Search descriptions", exact: true });
    await search.fill("Cafe");
    if (width < 768) await page.getByRole("button", { name: "Filter Transactions", exact: true }).click();
    await page.getByRole("combobox", { name: "Sort by", exact: true }).click();
    await page.getByRole("option", { name: "Amount: highest first", exact: true }).click();
    await page.getByRole("combobox", { name: "Category", exact: true }).click();
    await page.getByRole("option", { name: "Unmapped", exact: true }).click();
    await page.getByLabel("From", { exact: true }).filter({ visible: true }).fill("2026-09-01");
    if (width < 768) await page.getByRole("button", { name: "Close navigation" }).click();
    await page.getByRole("button", { name: width < 768 ? "Edit Category for Payment to Last Cafe" : "Edit Payment to Last Cafe", exact: false }).click();
    const category = page.getByRole("combobox", { name: "Category for Payment to Last Cafe" });
    if (width < 768) await expect(category).toBeFocused();
    await page.getByRole("button", { name: `Use suggested Category: ${suggestedCategoryName}`, exact: true }).click();
    await page.getByRole("button", { name: width < 768 ? "Cancel" : "Cancel changes to Payment to Last Cafe", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review 2 Transactions" })).toBeDisabled();
    await page.getByRole("button", { name: width < 768 ? "Edit Category for Payment to Last Cafe" : "Edit Payment to Last Cafe", exact: false }).click();
    await page.getByRole("button", { name: `Use suggested Category: ${suggestedCategoryName}`, exact: true }).click();
    if (width < 768) {
      await expect(page.getByLabel("Description for Payment to Last Cafe", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Full corrections" }).click();
    }
    await page.getByLabel("Description for Payment to Last Cafe", { exact: true }).fill("Payment to Corrected Cafe");
    await page.getByLabel("Date for Payment to Last Cafe", { exact: true }).fill("2026-09-04");
    await page.getByLabel("Amount for Payment to Last Cafe", { exact: true }).fill("-31.00");
    await page.getByRole("button", { name: "Apply & next", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "Category for Payment to First Cafe" })).toBeFocused();
    await selectCategory(page, "Payment to First Cafe", suggestedCategoryName);
    await page.getByRole("button", { name: "Apply & next", exact: true }).click();
    await expect(page.getByText("All included expenses have a Category. Continue to Review when ready.")).toBeVisible();
    await expect(search).toHaveValue("Cafe");
    if (width < 768) await page.getByRole("button", { name: "Filter Transactions, filters active" }).click();
    await expect(page.getByRole("combobox", { name: "Sort by", exact: true })).toContainText("Amount: highest first");
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toContainText("Unmapped");
    await expect(page.getByLabel("From", { exact: true }).filter({ visible: true })).toHaveValue("2026-09-01");
    if (width < 768) await page.getByRole("button", { name: "Close navigation" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const beforeCommit = await request.get(`${context.apiBaseUrl}/api/v1/users/me/spaces/${context.spaceId}/statement-imports`, { headers: authorizationHeaders(context.token) });
    expect(readObjectsField(await beforeCommit.json(), "items")).toHaveLength(0);
    await page.getByRole("button", { name: "Include Payment to Excluded Cafe", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review 3 Transactions" })).toBeDisabled();
    await page.getByRole("button", { name: width < 768 ? "Edit Category for Payment to Excluded Cafe" : "Edit Payment to Excluded Cafe", exact: false }).click();
    await selectCategory(page, "Payment to Excluded Cafe", suggestedCategoryName);
    await page.getByRole("button", { name: "Apply & next", exact: true }).click();
    await page.getByRole("button", { name: "Review 3 Transactions" }).click();
    await page.getByRole("button", { name: "Import 3 Transactions" }).click();
    await expect(page.getByRole("heading", { name: "Statement imported" })).toBeVisible();
    const response = await request.get(`${context.apiBaseUrl}/api/v1/users/me/spaces/${context.spaceId}/transactions?pageSize=100`, { headers: authorizationHeaders(context.token) });
    expect(response.status()).toBe(200);
    const saved = readObjectsField(await response.json(), "items");
    expect(saved).toHaveLength(3);
    expect(findTransaction(saved, "Payment to Corrected Cafe")).toMatchObject({ categoryId, amount: "31.00", purchaseDate: "2026-09-04" });
  });
}

async function switchToNewUser(page: Page): Promise<string> {
  await page.goto("/categories");
  const token = await createNewLocalTestUser(page);

  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Fresh Local User",
  );
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();
  return token;
}

async function getPersonalSpaceId(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
): Promise<string> {
  const response = await request.get(`${apiBaseUrl}/api/v1/users/me/spaces`, {
    headers: authorizationHeaders(token),
  });
  expect(response.status()).toBe(200);
  const spaces = readArray(await response.json()).filter(isRecord);
  const personalSpace = spaces.find(
    (space) => space.kind === "personal" && space.status === "active",
  );
  return requiredString(personalSpace, "id");
}

async function createFreshUserSpaceContext(
  page: Page,
  request: APIRequestContext,
  apiBaseUrl: string,
): Promise<AuthenticatedSpaceContext> {
  const token = await switchToNewUser(page);
  const spaceId = await getPersonalSpaceId(request, apiBaseUrl, token);
  return { request, apiBaseUrl, token, spaceId };
}

interface AuthenticatedSpaceContext {
  readonly request: APIRequestContext;
  readonly apiBaseUrl: string;
  readonly token: string;
  readonly spaceId: string;
}

async function createCategory(
  { request, apiBaseUrl, token, spaceId }: AuthenticatedSpaceContext,
  name: string,
): Promise<string> {
  const response = await request.post(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/categories`,
    {
      headers: authorizationHeaders(token),
      data: { name },
    },
  );
  expect(response.status()).toBe(201);
  return requiredString(await response.json(), "id");
}

async function createCategoryRule(
  { request, apiBaseUrl, token, spaceId }: AuthenticatedSpaceContext,
  rule: {
    readonly categoryId: string;
    readonly pattern: string;
    readonly matchType: "exact" | "contains";
  },
): Promise<void> {
  const response = await request.post(
    `${apiBaseUrl}/api/v1/users/me/spaces/${spaceId}/category-rules`,
    {
      headers: authorizationHeaders(token),
      data: rule,
    },
  );
  expect(response.status()).toBe(201);
}

async function expectCategorySuggestionContract(
  request: APIRequestContext,
  apiBaseUrl: string,
): Promise<void> {
  const response = await request.get(`${apiBaseUrl}/docs-json`);
  expect(response.status()).toBe(200);
  const document = readRecord(await response.json(), "OpenAPI document");
  const paths = readRecord(document.paths, "OpenAPI paths");
  const path = readRecord(paths[suggestionPath], "category suggestion path");
  const operation = readRecord(path.post, "category suggestion operation");
  expect(operation.operationId).toBe("SpaceStatementImports_suggestCategory");

  const requestBody = readRecord(operation.requestBody, "request body");
  const requestContent = readRecord(requestBody.content, "request content");
  const requestJson = readRecord(
    requestContent["application/json"],
    "JSON request content",
  );
  const requestSchema = readRecord(requestJson.schema, "request schema");
  expect(requestSchema.$ref).toBe(
    "#/components/schemas/StatementCategorySuggestionRequestDto",
  );

  const responses = readRecord(operation.responses, "operation responses");
  const successResponse = readRecord(responses["200"], "200 response");
  const responseContent = readRecord(successResponse.content, "response content");
  const responseJson = readRecord(
    responseContent["application/json"],
    "JSON response content",
  );
  const responseSchema = readRecord(responseJson.schema, "response schema");
  expect(responseSchema.$ref).toBe(
    "#/components/schemas/StatementCategorySuggestionResponseDto",
  );
}

async function uploadStatement(
  page: Page,
  fileName: string,
  transactions: readonly GcashTransaction[],
  summary: GcashStatementSummary,
): Promise<void> {
  const lines = [
    "GCash Transaction History",
    "2026-09-01 to 2026-09-07",
    "Date and Time Description Reference No. Debit Credit Balance",
    `STARTING BALANCE ${summary.startingBalance}`,
    ...transactions.map(
      ({ date, time, description, reference, debit, balance }) =>
        `${date} ${time} ${description} ${reference} ${debit} ${balance}`,
    ),
    `ENDING BALANCE ${summary.endingBalance}`,
    `Total Debit ${summary.totalDebit}`,
    `Total Credit ${summary.totalCredit}`,
  ];

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: createTextPdf(lines),
  });
  await page.getByRole("button", { name: "Skip" }).click();
}

interface GcashTransaction {
  readonly date: string;
  readonly time: string;
  readonly description: string;
  readonly reference: string;
  readonly debit: string;
  readonly balance: string;
}

interface GcashStatementSummary {
  readonly startingBalance: string;
  readonly endingBalance: string;
  readonly totalDebit: string;
  readonly totalCredit: string;
}

function getCategorySuggestionPath(spaceId: string): string {
  return suggestionPath.replace("{spaceId}", spaceId);
}

function createTextPdf(lines: readonly string[]): Buffer {
  const pageText = lines
    .map(
      (line, index) =>
        `BT /F1 9 Tf 1 0 0 1 36 ${760 - index * 14} Tm (${escapePdfText(line)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(pageText, "ascii")} >>\nstream\n${pageText}\nendstream`,
  ];

  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const crossReferenceOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;

  return Buffer.from(document, "ascii");
}

function escapePdfText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

async function selectCategory(
  page: Page,
  description: string,
  categoryName: string,
): Promise<void> {
  await page
    .getByRole("combobox", { name: `Category for ${description}` })
    .click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
}

function findTransaction(
  transactions: readonly Record<string, unknown>[],
  description: string,
): Record<string, unknown> {
  const transaction = transactions.find(
    (candidate) => candidate.description === description,
  );
  if (!transaction)
    throw new Error(`Missing committed Transaction ${description}`);
  return transaction;
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a JSON array");
  return value;
}

function readObjectsField(
  value: unknown,
  field: string,
): Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value[field])) {
    throw new Error(`Expected a response with an array ${field}`);
  }

  return value[field].map((item) => {
    if (!isRecord(item)) {
      throw new Error(`Expected ${field} to contain only objects`);
    }
    return item;
  });
}

function readRecord(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${description} to be a JSON object`);
  }

  return value;
}

function requiredString(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== "string") {
    throw new Error(`Expected a response with a string ${field}`);
  }

  return value[field];
}
