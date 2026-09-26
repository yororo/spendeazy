// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { ApiGetClient } from "@/shared/api";

import { loadAvailableAccounts, loadStatementImports } from "./account";

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

describe("loadAvailableAccounts", () => {
  it("deduplicates Accounts across Statement Imports and includes Cash", async () => {
    const get = vi.fn(async (path: string) => path.endsWith("cursor=next")
      ? { items: [{ bank: "GCash", cardType: "E-Wallet" }], nextCursor: null }
      : { items: [{ bank: "BDO", cardType: "AMEX" }, { bank: "BDO", cardType: "AMEX" }], nextCursor: "next" });
    const accounts = await loadAvailableAccounts({ get } as unknown as ApiGetClient);
    expect(accounts.map((account) => account.label)).toEqual(["Cash", "BDO · AMEX", "GCash · E-Wallet"]);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
