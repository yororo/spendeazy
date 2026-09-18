// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { loadStatementImports } from "./account";

describe("loadStatementImports in a browser realm", () => {
  it("preserves an API DOMException cancellation", async () => {
    const abortError = new DOMException(
      "signal is aborted without reason",
      "AbortError",
    );
    const apiClient = {
      get: vi.fn(() => Promise.reject(abortError)),
    };

    const request = loadStatementImports(apiClient, [
      {
        id: "transaction-1",
        source: "imported",
        statementImportId: "statement-import-1",
      },
    ]);

    await expect(request).rejects.toBe(abortError);
  });
});
