import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { shouldRetryProvisioning } from "./user-profile-queries";

function createApiError(
  options: ConstructorParameters<typeof ApiError>[1],
): ApiError {
  return new ApiError("Provisioning failed", options);
}

describe("shouldRetryProvisioning", () => {
  it.each([
    [
      "a network failure",
      createApiError({ kind: "network" }),
    ],
    [
      "a structured 503",
      createApiError({
        kind: "http",
        status: 503,
        code: "SERVICE_UNAVAILABLE",
      }),
    ],
  ] as const)("retries %s once", (_, error) => {
    expect(shouldRetryProvisioning(0, error)).toBe(true);
    expect(shouldRetryProvisioning(1, error)).toBe(false);
  });

  it.each([
    ["a validation failure", { kind: "http", status: 400 }],
    ["a 404", { kind: "http", status: 404 }],
    ["a 406", { kind: "http", status: 406 }],
    ["a 409", { kind: "http", status: 409 }],
    ["an authentication failure", { kind: "authentication" }],
    ["a malformed response", { kind: "malformed-response", status: 503 }],
  ] as const)("does not retry %s", (_, options) => {
    expect(shouldRetryProvisioning(0, createApiError(options))).toBe(false);
  });

  it("does not retry an unclassified error", () => {
    expect(shouldRetryProvisioning(0, new Error("unknown"))).toBe(false);
  });
});
