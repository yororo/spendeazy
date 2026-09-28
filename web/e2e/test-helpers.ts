import type { Page } from "@playwright/test";

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function createNewLocalTestUser(page: Page): Promise<string> {
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

function authorizationHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function readSessionToken(value: unknown): string {
  if (!isRecord(value) || typeof value.token !== "string") {
    throw new Error("The local test session response did not include a token.");
  }

  return value.token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export {
  authorizationHeaders,
  createNewLocalTestUser,
  isRecord,
  readSessionToken,
  requireEnvironment,
};
