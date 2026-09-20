import { expect, test, type APIRequestContext } from "@playwright/test";

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
  expect(primarySpaces).toHaveLength(1);
  expect(primarySpaces[0]).toMatchObject({
    kind: "personal",
    status: "active",
    accessLevel: "write",
  });

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
  expect(secondarySpaces).toHaveLength(1);
  expect(secondarySpaces[0].id).not.toBe(primarySpaces[0].id);

  const crossUserRead = await request.get(
    `${apiBaseUrl}/api/v1/users/me/spaces/${String(primarySpaces[0].id)}`,
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

async function issueSession(
  request: APIRequestContext,
  apiBaseUrl: string,
  token: string,
  scenario: "secondary",
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
