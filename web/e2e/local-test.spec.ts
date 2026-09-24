import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const testClock =
  process.env.SPENDEAZY_E2E_TEST_CLOCK ?? "2026-09-19T12:00:00.000Z";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: testClock });
});

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
    page
      .getByRole("table", { name: "Desktop Budget Categories" })
      .getByText("Food & Drink", { exact: true }),
  ).toBeVisible();
});

test("creates a fresh User with real first-time provisioning", async ({
  page,
}) => {
  await page.goto("/categories");
  const panel = page.getByTestId("local-test-panel");

  await panel.getByRole("button", { name: "New User" }).click();
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Fresh Local User",
  );
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Desktop Budget Categories" })
      .getByText("Food & Drink", { exact: true }),
  ).toBeVisible();

  const firstFreshUser = await page
    .getByTestId("local-test-active-user")
    .textContent();
  await panel.getByRole("button", { name: "New User" }).click();
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Fresh Local User",
  );
  await expect
    .poll(() => page.getByTestId("local-test-active-user").textContent())
    .not.toBe(firstFreshUser);
});

test("switches Users without exposing stale browser data", async ({ page }) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const primaryToken = requireEnvironment("VITE_LOCAL_TEST_SESSION_TOKEN");
  const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
  const description = "Primary-only browser isolation fixture";

  await page.goto("/transactions");
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", {
      name: "Populated User",
    })
    .click();
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Local Test User",
  );

  const created = await createTransaction(page, {
    apiBaseUrl,
    token: primaryToken,
    purchaseDate,
    description,
  });
  expect(created.status).toBe(201);

  await page.reload();
  await expect(
    page.getByRole("table").getByText(description, { exact: true }),
  ).toBeVisible();

  const panel = page.getByTestId("local-test-panel");
  await panel.getByRole("button", { name: "Second User" }).click();
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Local Test Companion",
  );
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "Populated User" }).click();
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Local Test User",
  );
  await expect(
    page.getByRole("table").getByText(description, { exact: true }),
  ).toBeVisible();
  expect(created.body).toMatchObject({ description });
});

test("provisions private Personal Spaces and denies cross-User Space reads", async ({
  page,
  request,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const primaryToken = requireEnvironment("VITE_LOCAL_TEST_SESSION_TOKEN");

  await page.goto("/categories");
  await expect(
    page.getByRole("heading", { name: "Budget overview" }),
  ).toBeVisible();
  const primarySpacesResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces`,
    { headers: authorizationHeaders(primaryToken) },
  );
  expect(primarySpacesResponse.status()).toBe(200);
  const primarySpaces = (await primarySpacesResponse.json()) as {
    id?: unknown;
    kind?: unknown;
    status?: unknown;
    accessLevel?: unknown;
  }[];
  const primaryPersonalSpace = primarySpaces.find(
    (space) => space.kind === "personal",
  );
  expect(primaryPersonalSpace).toMatchObject({
    kind: "personal",
    status: "active",
    accessLevel: "write",
  });
  expect(primarySpaces.some((space) => space.kind === "shared")).toBe(true);

  const secondarySession = await issueSession(
    request,
    apiBaseUrl,
    primaryToken,
    "secondary",
  );
  const secondaryProvisioning = await request.put(
    `${apiBaseUrl}/api/v1/users/me`,
    { headers: authorizationHeaders(secondarySession.token) },
  );
  expect([200, 201]).toContain(secondaryProvisioning.status());
  const secondarySpacesResponse = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces`,
    { headers: authorizationHeaders(secondarySession.token) },
  );
  expect(secondarySpacesResponse.status()).toBe(200);
  const secondarySpaces = (await secondarySpacesResponse.json()) as {
    id?: unknown;
  }[];
  const secondaryPersonalSpace = secondarySpaces.find(
    (space) => space.kind === "personal",
  );
  expect(secondaryPersonalSpace).toBeDefined();
  expect(secondaryPersonalSpace?.id).not.toBe(primaryPersonalSpace?.id);
  expect(secondarySpaces.some((space) => space.kind === "shared")).toBe(true);

  const crossUserRead = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${String(primaryPersonalSpace?.id)}`,
    { headers: authorizationHeaders(secondarySession.token) },
  );
  expect(crossUserRead.status()).toBe(404);
  await expect(crossUserRead.json()).resolves.toMatchObject({
    error: { code: "SPACE_NOT_FOUND" },
  });
});

test("signs out protected routes and re-enters without Clerk", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", {
      name: "Sign out",
    })
    .click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId("local-test-signed-out")).toBeVisible();

  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId("local-test-signed-out")).toBeVisible();

  await page.getByRole("button", { name: "Resume synthetic session" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("local-test-panel")).toContainText(
    "LOCAL TEST",
  );
});

test("refreshes an expired session through the real API recovery path", async ({
  page,
  request,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  await page.goto("/transactions");
  const panel = page.getByTestId("local-test-panel");
  const sessionState = page.getByTestId("local-test-session-state");
  await expect(sessionState).toHaveAttribute("data-session-mode", "active");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  const authenticationStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/users/me")) {
      authenticationStatuses.push(response.status());
    }
  });

  const rejectedRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me") && response.status() === 401,
  );
  const expireResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me/local-test/sessions/expire") &&
      response.status() === 201,
  );

  await panel.getByRole("button", { name: "Expire token" }).click();
  const expireBody = (await (await expireResponse).json()) as {
    expiredSession?: { token?: unknown };
    refreshedSession?: { token?: unknown };
  };
  await rejectedRequest;
  await expect(sessionState).toHaveAttribute("data-session-mode", "active");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await expect
    .poll(() => authenticationStatuses.length)
    .toBeGreaterThanOrEqual(2);
  expect(
    authenticationStatuses.filter((status) => status === 401),
  ).toHaveLength(1);
  expect(authenticationStatuses.length).toBeLessThanOrEqual(3);

  const expiredToken = readSessionToken(expireBody.expiredSession);
  const refreshedToken = readSessionToken(expireBody.refreshedSession);
  const rejectedAccess = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(expiredToken) },
  );
  await expectUnauthenticated(rejectedAccess);

  const resumedAccess = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(refreshedToken) },
  );
  expect(resumedAccess.status()).toBe(200);
});

test("revokes a session, clears private data, and allows deliberate re-entry", async ({
  page,
  request,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");

  await page.goto("/transactions");
  const secondarySessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me/local-test/sessions") &&
      response.status() === 201,
  );
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", {
      name: "Second User",
    })
    .click();
  const secondaryToken = readSessionToken(
    await (await secondarySessionResponse).json(),
  );
  const privateDescription = "Revoked session private fixture";
  const created = await createTransactionWithRequest(request, apiBaseUrl, {
    token: secondaryToken,
    purchaseDate,
    description: privateDescription,
  });
  expect(created.status()).toBe(201);

  const refreshedSecondaryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me/local-test/sessions") &&
      response.status() === 201,
  );
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", {
      name: "Second User",
    })
    .click();
  const activeSecondaryToken = readSessionToken(
    await (await refreshedSecondaryResponse).json(),
  );
  await expect(page.getByTestId("local-test-active-user")).toContainText(
    "Local Test Companion",
  );
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText(privateDescription, { exact: true }),
  ).toBeVisible();

  const panel = page.getByTestId("local-test-panel");
  const authenticationStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/users/me")) {
      authenticationStatuses.push(response.status());
    }
  });
  const rejectedRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me") && response.status() === 401,
  );
  const revokeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me/local-test/sessions/revoke") &&
      response.status() === 201,
  );

  await panel.getByRole("button", { name: "Revoke session" }).click();
  const revokeBody = (await (await revokeResponse).json()) as {
    resumeSession?: { token?: unknown };
  };
  await rejectedRequest;
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId("local-test-signed-out")).toBeVisible();
  await expect(page.getByText(privateDescription, { exact: true })).toHaveCount(
    0,
  );
  expect(authenticationStatuses).toEqual([401]);

  const revokedAccess = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(activeSecondaryToken) },
  );
  await expectUnauthenticated(revokedAccess);

  const resumeToken = readSessionToken(revokeBody.resumeSession);
  expect(resumeToken).not.toBe(activeSecondaryToken);
  const resumedAccess = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(resumeToken) },
  );
  expect(resumedAccess.status()).toBe(200);

  await page.getByRole("button", { name: "Resume synthetic session" }).click();
  await expect(page.getByTestId("local-test-panel")).toContainText(
    "LOCAL TEST",
  );
});

test("proves ownership isolation through authenticated API requests", async ({
  request,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const primaryToken = requireEnvironment("VITE_LOCAL_TEST_SESSION_TOKEN");
  const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
  const secondarySession = await issueSession(
    request,
    apiBaseUrl,
    primaryToken,
    "secondary",
  );
  const primaryDescription = "Ownership boundary primary fixture";
  const secondaryDescription = "Ownership boundary secondary fixture";

  const primaryTransaction = await createTransactionWithRequest(
    request,
    apiBaseUrl,
    {
      token: primaryToken,
      purchaseDate,
      description: primaryDescription,
    },
  );
  expect(primaryTransaction.status()).toBe(201);
  const primaryBody = (await primaryTransaction.json()) as {
    id?: unknown;
    description?: unknown;
  };
  expect(primaryBody.description).toBe(primaryDescription);
  expect(typeof primaryBody.id).toBe("string");

  const secondaryTransaction = await createTransactionWithRequest(
    request,
    apiBaseUrl,
    {
      token: secondarySession.token,
      purchaseDate,
      description: secondaryDescription,
    },
  );
  expect(secondaryTransaction.status()).toBe(201);

  const secondaryHistory = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(secondarySession.token) },
  );
  expect(secondaryHistory.status()).toBe(200);
  const secondaryHistoryBody = (await secondaryHistory.json()) as {
    items?: readonly { description?: unknown }[];
  };
  expect(
    secondaryHistoryBody.items?.some(
      (item) => item.description === primaryDescription,
    ),
  ).toBe(false);
  expect(
    secondaryHistoryBody.items?.some(
      (item) => item.description === secondaryDescription,
    ),
  ).toBe(true);

  const crossUserMutation = await request.patch(
    `${apiBaseUrl}/api/v1/users/me/transactions/${String(primaryBody.id)}`,
    {
      headers: {
        ...authorizationHeaders(secondarySession.token),
        "Content-Type": "application/json",
      },
      data: { description: "Cross-user mutation" },
    },
  );
  expect(crossUserMutation.status()).toBe(404);

  const primaryHistory = await request.get(
    `${apiBaseUrl}/api/v1/users/me/transactions`,
    { headers: authorizationHeaders(primaryToken) },
  );
  expect(primaryHistory.status()).toBe(200);
  const primaryHistoryBody = (await primaryHistory.json()) as {
    items?: readonly { description?: unknown }[];
  };
  expect(
    primaryHistoryBody.items?.some(
      (item) => item.description === primaryDescription,
    ),
  ).toBe(true);
});

test("completes the two-member Shared Space financial journey from the local fixture", async ({
  page,
  browser,
  request,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const primaryToken = requireEnvironment("VITE_LOCAL_TEST_SESSION_TOKEN");
  const purchaseDate = requireEnvironment("SPENDEAZY_E2E_TEST_DATE");
  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();

  try {
    await page.goto("/sharing");
    await expect(page.getByTestId("local-test-active-user")).toContainText(
      "Local Test User",
    );
    await secondaryPage.clock.install({ time: testClock });
    await secondaryPage.goto("/sharing?localTestScenario=secondary");
    await expect(
      secondaryPage.getByTestId("local-test-active-user"),
    ).toContainText("Local Test Companion");

    const secondarySession = await issueSession(
      request,
      apiBaseUrl,
      primaryToken,
      "secondary",
    );
    const primarySpaces = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      "/api/v1/users/me/spaces",
    );
    const secondarySpaces = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      "/api/v1/users/me/spaces",
    );
    expect(primarySpaces.status).toBe(200);
    expect(secondarySpaces.status).toBe(200);
    const primarySpaceList = readSpaceList(primarySpaces.body);
    const secondarySpaceList = readSpaceList(secondarySpaces.body);
    const sharedSpace = primarySpaceList.find(
      (space) => space.kind === "shared",
    );
    const primaryPersonalSpace = primarySpaceList.find(
      (space) => space.kind === "personal",
    );
    const secondaryPersonalSpace = secondarySpaceList.find(
      (space) => space.kind === "personal",
    );
    expect(sharedSpace).toBeDefined();
    expect(primaryPersonalSpace).toBeDefined();
    expect(secondaryPersonalSpace).toBeDefined();
    expect(
      secondarySpaceList.some((space) => space.id === sharedSpace?.id),
    ).toBe(true);
    expect(sharedSpace?.members).toHaveLength(2);

    const sharedSpaceId = sharedSpace!.id;
    const primaryCategory = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/categories`,
      {
        method: "POST",
        body: { name: "Primary Journey Category" },
      },
    );
    const secondaryCategory = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/categories`,
      {
        method: "POST",
        body: { name: "Secondary Journey Category" },
      },
    );
    expect(primaryCategory.status).toBe(201);
    expect(secondaryCategory.status).toBe(201);
    const primaryCategoryId = readStringId(primaryCategory.body);
    const secondaryCategoryId = readStringId(secondaryCategory.body);

    for (const [journeyPage, token] of [
      [page, primaryToken],
      [secondaryPage, secondarySession.token],
    ] as const) {
      const categories = await browserApi(
        journeyPage,
        apiBaseUrl,
        token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/categories`,
      );
      expect(categories.status).toBe(200);
      expect(JSON.stringify(categories.body)).toContain(
        "Primary Journey Category",
      );
      expect(JSON.stringify(categories.body)).toContain(
        "Secondary Journey Category",
      );
    }

    const primaryBudget = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/categories/${primaryCategoryId}/budget`,
      { method: "PUT", body: { amount: "321.00", period: "monthly" } },
    );
    const secondaryBudget = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/categories/${secondaryCategoryId}/budget`,
      { method: "PUT", body: { amount: "654.00", period: "monthly" } },
    );
    expect([200, 201]).toContain(primaryBudget.status);
    expect([200, 201]).toContain(secondaryBudget.status);

    const primaryRule = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/category-rules`,
      {
        method: "POST",
        body: {
          categoryId: primaryCategoryId,
          pattern: "PRIMARY JOURNEY",
          matchType: "exact",
        },
      },
    );
    const secondaryRule = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/category-rules`,
      {
        method: "POST",
        body: {
          categoryId: secondaryCategoryId,
          pattern: "SECONDARY JOURNEY",
          matchType: "exact",
        },
      },
    );
    expect(primaryRule.status).toBe(201);
    expect(secondaryRule.status).toBe(201);

    const primaryTransaction = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions`,
      {
        method: "POST",
        body: {
          categoryId: primaryCategoryId,
          purchaseDate,
          description: "Primary shared transaction",
          amount: "123.45",
        },
      },
    );
    const secondaryTransaction = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions`,
      {
        method: "POST",
        body: {
          categoryId: secondaryCategoryId,
          purchaseDate,
          description: "Secondary shared transaction",
          amount: "67.89",
        },
      },
    );
    expect(primaryTransaction.status).toBe(201);
    expect(secondaryTransaction.status).toBe(201);
    const deletedTransactionId = readStringId(primaryTransaction.body);
    const deletedUpdatedAt = readStringField(
      primaryTransaction.body,
      "updatedAt",
    );
    const deleteResponse = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${deletedTransactionId}`,
      {
        method: "DELETE",
        headers: { "If-Match": deletedUpdatedAt },
      },
    );
    expect(deleteResponse.status).toBe(204);

    for (const [journeyPage, token] of [
      [page, primaryToken],
      [secondaryPage, secondarySession.token],
    ] as const) {
      const retainedHistory = await browserApi(
        journeyPage,
        apiBaseUrl,
        token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/history`,
      );
      expect(retainedHistory.status).toBe(200);
      expect(JSON.stringify(retainedHistory.body)).toContain(
        "Primary shared transaction",
      );
    }
    const deletedActivity = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${deletedTransactionId}/activity`,
    );
    expect(deletedActivity.status).toBe(200);
    expect(JSON.stringify(deletedActivity.body)).toContain('"type":"created"');
    expect(JSON.stringify(deletedActivity.body)).toContain('"type":"deleted"');

    const imported = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/statement-imports`,
      {
        method: "POST",
        body: {
          fileName: "shared-browser-journey.pdf",
          fileHash: "c".repeat(64),
          statementDate: purchaseDate,
          bank: "Browser Journey Bank",
          cardType: "visa",
          transactions: [
            {
              categoryId: secondaryCategoryId,
              purchaseDate,
              description: "Secondary imported transaction",
              amount: "45.67",
            },
          ],
        },
      },
    );
    expect(imported.status).toBe(201);
    const imports = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/statement-imports`,
    );
    expect(imports.status).toBe(200);
    expect(JSON.stringify(imports.body)).toContain(
      "shared-browser-journey.pdf",
    );
    const sharedTransactions = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions`,
    );
    expect(sharedTransactions.status).toBe(200);
    expect(JSON.stringify(sharedTransactions.body)).toContain(
      "Secondary shared transaction",
    );
    expect(JSON.stringify(sharedTransactions.body)).toContain(
      "Secondary imported transaction",
    );
    const importedTransactionId = readStringIdByDescription(
      sharedTransactions.body,
      "Secondary imported transaction",
    );
    const importedUpdatedAt = readStringFieldByDescription(
      sharedTransactions.body,
      "Secondary imported transaction",
      "updatedAt",
    );
    const importedAddedByUserId = readStringFieldByDescription(
      sharedTransactions.body,
      "Secondary imported transaction",
      "addedByUserId",
    );
    const primaryImportedEdit = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${importedTransactionId}`,
      {
        method: "PATCH",
        body: {
          categoryId: primaryCategoryId,
          purchaseDate: "2026-09-17",
          description: "Secondary import corrected by primary",
          amount: "46.67",
          updatedAt: importedUpdatedAt,
        },
      },
    );
    expect(primaryImportedEdit.status).toBe(200);
    expect(primaryImportedEdit.body).toMatchObject({
      source: "imported",
      addedByUserId: importedAddedByUserId,
      description: "Secondary import corrected by primary",
      amount: "46.67",
    });

    const primaryImported = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/statement-imports`,
      {
        method: "POST",
        body: {
          fileName: "shared-browser-primary-journey.pdf",
          fileHash: "d".repeat(64),
          statementDate: purchaseDate,
          bank: "Browser Primary Journey Bank",
          cardType: "visa",
          transactions: [
            {
              categoryId: primaryCategoryId,
              purchaseDate,
              description: "Primary imported transaction",
              amount: "78.90",
            },
          ],
        },
      },
    );
    expect(primaryImported.status).toBe(201);
    const primaryStatementImportId = readStringId(primaryImported.body);
    const secondaryTransactions = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions`,
    );
    expect(secondaryTransactions.status).toBe(200);
    const primaryImportedTransactionId = readStringIdByDescription(
      secondaryTransactions.body,
      "Primary imported transaction",
    );
    const primaryImportedUpdatedAt = readStringFieldByDescription(
      secondaryTransactions.body,
      "Primary imported transaction",
      "updatedAt",
    );
    const primaryImportedAddedByUserId = readStringFieldByDescription(
      secondaryTransactions.body,
      "Primary imported transaction",
      "addedByUserId",
    );
    const secondaryImportedEdit = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${primaryImportedTransactionId}`,
      {
        method: "PATCH",
        body: {
          categoryId: secondaryCategoryId,
          purchaseDate: "2026-09-16",
          description: "Primary import corrected by secondary",
          amount: "80.90",
          updatedAt: primaryImportedUpdatedAt,
        },
      },
    );
    expect(secondaryImportedEdit.status).toBe(200);
    expect(secondaryImportedEdit.body).toMatchObject({
      source: "imported",
      addedByUserId: primaryImportedAddedByUserId,
      description: "Primary import corrected by secondary",
      amount: "80.90",
    });
    expect(secondaryTransaction.status).toBe(201);

    for (const [journeyPage, token] of [
      [page, primaryToken],
      [secondaryPage, secondarySession.token],
    ] as const) {
      const report = await browserApi(
        journeyPage,
        apiBaseUrl,
        token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/category-summaries?period=monthly&year=2026&month=09`,
      );
      expect(report.status).toBe(200);
      expect(JSON.stringify(report.body)).toContain('"period":"monthly"');
    }

    const thirdSession = await issueSession(
      request,
      apiBaseUrl,
      primaryToken,
      "new",
    );
    const thirdProvisioning = await browserApi(
      page,
      apiBaseUrl,
      thirdSession.token,
      "/api/v1/users/me",
      { method: "PUT" },
    );
    expect([200, 201]).toContain(thirdProvisioning.status);
    const thirdSpaces = await browserApi(
      page,
      apiBaseUrl,
      thirdSession.token,
      "/api/v1/users/me/spaces",
    );
    expect(thirdSpaces.status).toBe(200);
    expect(readSpaceList(thirdSpaces.body)).toHaveLength(1);
    const thirdSharedRead = await browserApi(
      page,
      apiBaseUrl,
      thirdSession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/categories`,
    );
    expect(thirdSharedRead.status).toBe(404);
    const unrelatedImportedEdit = await browserApi(
      page,
      apiBaseUrl,
      thirdSession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${importedTransactionId}`,
      {
        method: "PATCH",
        body: {
          description: "Unrelated correction",
          updatedAt: readStringField(primaryImportedEdit.body, "updatedAt"),
        },
      },
    );
    expect(unrelatedImportedEdit.status).toBe(404);
    const unrelatedImportedDelete = await browserApi(
      page,
      apiBaseUrl,
      thirdSession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${importedTransactionId}`,
      {
        method: "DELETE",
        headers: {
          "If-Match": readStringField(primaryImportedEdit.body, "updatedAt"),
        },
      },
    );
    expect(unrelatedImportedDelete.status).toBe(404);

    const primaryImportedDelete = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${importedTransactionId}`,
      {
        method: "DELETE",
        headers: {
          "If-Match": readStringField(primaryImportedEdit.body, "updatedAt"),
        },
      },
    );
    expect(primaryImportedDelete.status).toBe(204);
    const secondaryImportedDelete = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${primaryImportedTransactionId}`,
      {
        method: "DELETE",
        headers: {
          "If-Match": readStringField(secondaryImportedEdit.body, "updatedAt"),
        },
      },
    );
    expect(secondaryImportedDelete.status).toBe(204);

    for (const [journeyPage, token] of [
      [page, primaryToken],
      [secondaryPage, secondarySession.token],
    ] as const) {
      const activeTransactions = await browserApi(
        journeyPage,
        apiBaseUrl,
        token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions`,
      );
      expect(activeTransactions.status).toBe(200);
      expect(JSON.stringify(activeTransactions.body)).not.toContain(
        "Secondary import corrected by primary",
      );
      expect(JSON.stringify(activeTransactions.body)).not.toContain(
        "Primary import corrected by secondary",
      );

      const retainedImportedHistory = await browserApi(
        journeyPage,
        apiBaseUrl,
        token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/history`,
      );
      expect(retainedImportedHistory.status).toBe(200);
      const historyJson = JSON.stringify(retainedImportedHistory.body);
      expect(historyJson).toContain("Secondary import corrected by primary");
      expect(historyJson).toContain("Primary import corrected by secondary");
      expect(historyJson).toContain(primaryStatementImportId);
    }

    for (const transactionId of [
      importedTransactionId,
      primaryImportedTransactionId,
    ]) {
      const importedActivity = await browserApi(
        secondaryPage,
        apiBaseUrl,
        secondarySession.token,
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${transactionId}/activity`,
      );
      expect(importedActivity.status).toBe(200);
      const activityJson = JSON.stringify(importedActivity.body);
      expect(activityJson).toContain('"type":"created"');
      expect(activityJson).toContain('"type":"edited"');
      expect(activityJson).toContain('"type":"deleted"');
    }

    const secondaryPersonalRead = await browserApi(
      secondaryPage,
      apiBaseUrl,
      secondarySession.token,
      `/api/v1/users/me/spaces/${primaryPersonalSpace!.id}/categories`,
    );
    const primaryPersonalRead = await browserApi(
      page,
      apiBaseUrl,
      primaryToken,
      `/api/v1/users/me/spaces/${secondaryPersonalSpace!.id}/categories`,
    );
    expect(secondaryPersonalRead.status).toBe(404);
    expect(primaryPersonalRead.status).toBe(404);

    await page.goto(`/categories?spaceId=${sharedSpaceId}`);
    await expect(
      page.getByRole("heading", { name: "Budget overview" }),
    ).toBeVisible();
    await secondaryPage.goto(
      `/transactions?spaceId=${sharedSpaceId}&localTestScenario=secondary`,
    );
    await expect(
      secondaryPage.getByRole("heading", { name: "Your spending" }),
    ).toBeVisible();

  } finally {
    await secondaryContext.close();
  }
});

test("completes the Invite Code journey between two fresh signed-in Users", async ({
  page,
  browser,
}) => {
  const apiBaseUrl = requireEnvironment("SPENDEAZY_E2E_API_BASE_URL");
  const recipientContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();

  try {
    await page.goto("/sharing");
    const senderToken = await switchToNewUser(page);
    const senderName = (
      await page.getByTestId("local-test-active-user").textContent()
    )?.trim();
    if (!senderName) throw new Error("The sender name was not rendered.");
    await expect(
      page.getByRole("heading", {
        name: "Create a Shared Space Invite Code",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create Invite Code" }).click();
    const codeElement = page.locator("code");
    await expect(codeElement).toHaveText(
      /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u,
    );
    const code = (await codeElement.textContent())?.trim();
    if (!code) throw new Error("The sender Invite Code was not rendered.");

    await page.context().grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin: new URL(page.url()).origin },
    );
    await page.getByRole("button", { name: "Copy Invite Code" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

    await recipientPage.clock.install({ time: testClock });
    await recipientPage.goto("/sharing");
    const recipientToken = await switchToNewUser(recipientPage);
    await expect(
      recipientPage.getByTestId("local-test-active-user"),
    ).toContainText("Fresh Local User");
    await recipientPage.getByLabel("Invite Code").fill(code);
    await recipientPage
      .getByRole("button", { name: "Save Invitation" })
      .click();
    await expect(
      recipientPage.getByText(senderName, { exact: true }),
    ).toBeVisible();
    await expect(
      recipientPage.getByRole("button", { name: "Join Shared Space" }),
    ).toBeVisible();

    const recipientSpacesBeforeJoin = await browserApi(
      recipientPage,
      apiBaseUrl,
      recipientToken,
      "/api/v1/users/me/spaces",
    );
    expect(recipientSpacesBeforeJoin.status).toBe(200);
    expect(
      readSpaceList(recipientSpacesBeforeJoin.body).filter(
        (space) => space.kind === "shared" && space.status === "active",
      ),
    ).toHaveLength(0);

    const savedInbox = await browserApi(
      recipientPage,
      apiBaseUrl,
      recipientToken,
      "/api/v1/users/me/invitations",
    );
    expect(savedInbox.status).toBe(200);
    expect(savedInbox.body).toMatchObject({
      incoming: [expect.objectContaining({ senderName, status: "pending" })],
    });

    await recipientPage
      .getByRole("button", { name: "Join Shared Space" })
      .click();
    await expect(recipientPage).toHaveURL(/\/\?spaceId=[1-9]\d*$/u);

    const senderSpaces = await browserApi(
      page,
      apiBaseUrl,
      senderToken,
      "/api/v1/users/me/spaces",
    );
    const recipientSpaces = await browserApi(
      recipientPage,
      apiBaseUrl,
      recipientToken,
      "/api/v1/users/me/spaces",
    );
    expect(senderSpaces.status).toBe(200);
    expect(recipientSpaces.status).toBe(200);
    const senderSharedSpaces = readSpaceList(senderSpaces.body).filter(
      (space) => space.kind === "shared" && space.status === "active",
    );
    const recipientSharedSpaces = readSpaceList(recipientSpaces.body).filter(
      (space) => space.kind === "shared" && space.status === "active",
    );
    expect(senderSharedSpaces).toHaveLength(1);
    expect(recipientSharedSpaces).toHaveLength(1);
    expect(recipientSharedSpaces[0]?.id).toBe(senderSharedSpaces[0]?.id);
    expect(senderSharedSpaces[0]?.members).toHaveLength(2);
  } finally {
    await recipientContext.close();
  }
});

test(
  "shows that new Shared Space creation is temporarily unavailable",
  async ({ page }) => {
    await page.goto("/sharing");
    await expect(
      page.getByRole("heading", {
        name: "Shared Space creation is temporarily unavailable",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Recipient email")).toHaveCount(0);
  },
);

async function issueSession(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  scenario: "secondary" | "new",
): Promise<{ token: string }> {
  const response = await request.post(
    `${apiBaseUrl}/api/v1/users/me/local-test/sessions`,
    {
      headers: {
        ...authorizationHeaders(token),
        "Content-Type": "application/json",
      },
      data: { scenario },
    },
  );
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== "string") {
    throw new Error("The local test session response did not include a token.");
  }

  return { token: body.token };
}

async function switchToNewUser(page: Page): Promise<string> {
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/users/me/local-test/sessions") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", { name: "New User" })
    .click();

  return readSessionToken(await (await sessionResponse).json());
}

interface BrowserApiResponse {
  readonly status: number;
  readonly body: unknown;
}

interface BrowserApiOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

interface BrowserSpace {
  readonly id: string;
  readonly kind: "personal" | "shared";
  readonly status: "active" | "archived";
  readonly members: readonly unknown[];
}

async function browserApi(
  page: Page,
  apiBaseUrl: string,
  token: string,
  path: string,
  options: BrowserApiOptions = {},
): Promise<BrowserApiResponse> {
  return page.evaluate(
    async ({ apiBaseUrl, token, path, method, body, headers }) => {
      const requestHeaders = new Headers({
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...headers,
      });
      if (body !== undefined) {
        requestHeaders.set("Content-Type", "application/json");
      }

      const response = await fetch(
        `${apiBaseUrl.replace(/\/+$/u, "")}${path}`,
        {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const text = await response.text();
      let parsedBody: unknown;
      try {
        parsedBody = text ? (JSON.parse(text) as unknown) : undefined;
      } catch {
        parsedBody = text;
      }

      return { status: response.status, body: parsedBody };
    },
    {
      apiBaseUrl,
      token,
      path,
      method: options.method ?? "GET",
      body: options.body,
      headers: options.headers,
    },
  );
}

function readSpaceList(value: unknown): BrowserSpace[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected a Space list");
  }

  return value as BrowserSpace[];
}

function readStringId(value: unknown): string {
  return readStringField(value, "id");
}

function readStringIdByDescription(value: unknown, description: string): string {
  return readStringFieldByDescription(value, description, "id");
}

function readStringFieldByDescription(
  value: unknown,
  description: string,
  field: string,
): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a transaction page");
  }

  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("Expected a transaction page");

  const item = items.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (candidate as { description?: unknown }).description === description,
  );
  if (!item) throw new Error(`Missing transaction ${description}`);

  return readStringField(item, field);
}

function readStringField(value: unknown, field: string): string {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>)[field] !== "string"
  ) {
    throw new Error(`Expected a response with a string ${field}`);
  }

  return (value as Record<string, string>)[field];
}

async function createTransaction(
  page: import("@playwright/test").Page,
  input: {
    apiBaseUrl: string;
    token: string;
    purchaseDate: string;
    description: string;
  },
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ apiBaseUrl, token, purchaseDate, description }) => {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/users/me/transactions`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            purchaseDate,
            description,
            amount: "123.45",
            categoryId: null,
          }),
        },
      );

      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    input,
  );
}

async function createTransactionWithRequest(
  request: APIRequestContext,
  apiBaseUrl: string,
  input: { token: string; purchaseDate: string; description: string },
) {
  return request.post(`${apiBaseUrl}/api/v1/users/me/transactions`, {
    headers: {
      ...authorizationHeaders(input.token),
      "Content-Type": "application/json",
    },
    data: {
      purchaseDate: input.purchaseDate,
      description: input.description,
      amount: "123.45",
      categoryId: null,
    },
  });
}

function authorizationHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function expectUnauthenticated(response: {
  status: () => number;
  json: () => Promise<unknown>;
}): Promise<void> {
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "UNAUTHENTICATED" },
  });
}

function readSessionToken(value: unknown): string {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as { token?: unknown }).token !== "string"
  ) {
    throw new Error("The local test session response did not include a token.");
  }

  return (value as { token: string }).token;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required for local-test E2E coverage.`);
  return value;
}
