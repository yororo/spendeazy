import { describe, expect, it } from "vitest";

import { ApiError } from "../api/api-client";
import { shouldRetryRead } from "./query-policy";

function createApiError(
  options: ConstructorParameters<typeof ApiError>[1],
): ApiError {
  return new ApiError("Request failed", options);
}

describe("shouldRetryRead", () => {
  it.each([
    ["a network failure", createApiError({ kind: "network" })],
    ["a 500 response", createApiError({ kind: "http", status: 500 })],
    ["a 503 response", createApiError({ kind: "http", status: 503 })],
    ["a 599 response", createApiError({ kind: "http", status: 599 })],
  ] as const)("retries %s once", (_, error) => {
    expect(shouldRetryRead(0, error)).toBe(true);
    expect(shouldRetryRead(1, error)).toBe(false);
  });

  it.each([
    ["a validation failure", createApiError({ kind: "http", status: 400 })],
    ["a 404 response", createApiError({ kind: "http", status: 404 })],
    ["a 499 response", createApiError({ kind: "http", status: 499 })],
    [
      "a malformed 503 response",
      createApiError({ kind: "malformed-response", status: 503 }),
    ],
    ["an authentication failure", createApiError({ kind: "authentication" })],
    ["a request failure", createApiError({ kind: "request" })],
    ["an unclassified failure", new Error("Request failed")],
  ] as const)("does not retry %s", (_, error) => {
    expect(shouldRetryRead(0, error)).toBe(false);
  });
});
