import { expect, type Page } from "@playwright/test";

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
  const token = sessionResponse.then(async response => readSessionToken(await response.json()));
  const provisioned = page.waitForResponse(async response =>
    response.url().endsWith("/api/v1/users/me") &&
    response.request().method() === "PUT" &&
    response.request().headers().authorization === `Bearer ${await token}`,
  );
  await page
    .getByTestId("local-test-panel")
    .getByRole("button", { name: "New User" })
    .click();

  // GET /me can succeed after the User insert but before Personal Space/default
  // creation finishes. The browser's authenticated PUT is the complete boundary.
  expect([200, 201]).toContain((await provisioned).status());
  return token;
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
