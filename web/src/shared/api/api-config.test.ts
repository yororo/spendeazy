import { describe, expect, it } from "vitest";

import { ApiConfigurationError, readApiConfig } from "./api-config";

describe("readApiConfig", () => {
  it("reads the API origin without a client-supplied User identifier", () => {
    expect(
      readApiConfig({
        VITE_API_BASE_URL: "https://api.example.test/",
      }),
    ).toEqual({
      baseUrl: "https://api.example.test",
    });
  });

  it.each([
    ["VITE_API_BASE_URL", {}],
    [
      "the API origin protocol",
      {
        VITE_API_BASE_URL: "api.example.test",
      },
    ],
  ])("rejects invalid %s configuration", (_, environment) => {
    expect(() => readApiConfig(environment)).toThrow(ApiConfigurationError);
  });

  it("exposes a recoverable configuration error with setup guidance", () => {
    expect(() => readApiConfig({})).toThrowError(
      expect.objectContaining({
        kind: "configuration",
        message: expect.stringContaining("VITE_API_BASE_URL"),
      }),
    );
  });
});
