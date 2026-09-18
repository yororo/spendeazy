// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";

describe("createApiClient in a browser realm", () => {
  it("preserves a fetch DOMException cancellation", async () => {
    const abortError = new DOMException(
      "signal is aborted without reason",
      "AbortError",
    );
    const fetchMock = vi.fn(() => Promise.reject(abortError));
    const client = createApiClient(
      { baseUrl: "https://api.example.test" },
      vi.fn(async () => "clerk-session-token"),
      fetchMock,
    );

    await expect(client.get("/transactions")).rejects.toBe(abortError);
  });
});
