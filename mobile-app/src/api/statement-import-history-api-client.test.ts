import { readFileSync } from "node:fs";
import type { ConfirmationPayload } from "../features/statement-import/confirmation-contract.ts";
import assert from "node:assert/strict";
import test from "node:test";

import { createStatementImportHistoryApiClient } from "./statement-import-history-api-client.ts";
import { requestFailure } from "./request-failure.ts";

test("Statement Import history adapter scopes a read to the selected Space and decodes retained metadata", async (t) => {
  const client = createStatementImportHistoryApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  let requestUrl = "";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    requestUrl = String(url);
    return Response.json({
      items: [
        {
          id: "18",
          fileName: "june.pdf",
          statementDate: "2026-06-30",
          provider: "BDO",
          accountFormat: null,
          statementType: "credit_card",
          historyFromDate: null,
          historyToDate: null,
          totalDebit: null,
          importedAt: "2026-07-01T00:00:00.000Z",
          importedByUserId: "7",
          expenseCount: "12",
          originalExpenseCount: null,
        },
      ],
      nextCursor: null,
    });
  });
  const page = await client.list("42");
  assert.equal(
    requestUrl,
    "https://example.invalid/api/v1/users/me/spaces/42/statement-imports?pageSize=100",
  );
  assert.equal(page.items[0]?.expenseCount, "12");
  assert.equal(page.items[0]?.fileName, "june.pdf");
});

test("malformed Statement Import history is not exposed as application data", async (t) => {
  const client = createStatementImportHistoryApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ items: [], nextCursor: 3 }),
  );
  await assert.rejects(
    client.list("42"),
    (cause) => requestFailure(cause) === "invalid-response",
  );
});

function detailFixture() {
  const payload = JSON.parse(
    readFileSync(
      new URL(
        "../features/statement-import/fixtures/confirmation.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ConfirmationPayload;
  const { transactions, ...evidence } = payload.evidence;
  return {
    id: "18",
    fileName: "june.pdf",
    statementDate: "2026-06-30",
    provider: "legacy bank",
    accountFormat: null,
    statementType: "credit_card",
    historyFromDate: null,
    historyToDate: null,
    totalDebit: null,
    importedAt: "2026-07-01T00:00:00.000Z",
    importedByUserId: "7",
    confirmation: {
      evidence,
      includedCount: "2",
      excludedCount: "8",
      originalExpenseCount: "2",
      originalExpenseTotal: "1300.00",
      acknowledgedWarnings: [],
      acknowledgedWarningDigest: null,
    },
    currentExpenses: { count: "1", totalAmount: "999999999999999999999.99" },
    rows: transactions.map((transaction, index) => {
      const { duplicateReference: _private, ...originalEvidence } = transaction;
      const confirmedValues =
        payload.expenses.find(
          (row) => row.sourceRowId === transaction.sourceRowId,
        ) ?? null;
      return {
        sourceRowId: transaction.sourceRowId,
        disposition: confirmedValues ? "included" : "excluded",
        originalEvidence,
        confirmedValues,
        exclusion:
          payload.excluded.find(
            (row) => row.sourceRowId === transaction.sourceRowId,
          ) ?? null,
        expense: confirmedValues
          ? {
              id: String(index + 1),
              edited: true,
              deletedAt: index === 0 ? "2026-10-29T12:00:00.000Z" : null,
            }
          : null,
      };
    }),
  };
}
test("detail decodes all original evidence, exact large totals, legacy provider and independent edited/deleted links", async (t) => {
  const client = createStatementImportHistoryApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  const fixture = detailFixture();
  let url = "";
  t.mock.method(globalThis, "fetch", async (input) => {
    url = String(input);
    return Response.json(fixture);
  });
  const result = await client.detail("42", "18");
  assert.equal(
    url,
    "https://example.invalid/api/v1/users/me/spaces/42/statement-imports/18",
  );
  assert.equal(result.rows.length, 10);
  assert.equal(
    result.currentExpenses.totalAmount,
    fixture.currentExpenses.totalAmount,
  );
  assert.equal(result.rows[0].expense?.edited, true);
  assert.ok(result.rows[0].expense?.deletedAt);
  assert.equal(result.provider, "legacy bank");
  fixture.confirmation = null as unknown as typeof fixture.confirmation;
  fixture.rows = [];
  assert.equal((await client.detail("42", "18")).confirmation, null);
});
test("malformed nested fields and private request fields fail at the request failure boundary", async (t) => {
  const client = createStatementImportHistoryApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  let fixture: unknown;
  t.mock.method(globalThis, "fetch", async () => Response.json(fixture));
  const mutations = [
    (f: any) => {
      f.currentExpenses.totalAmount = 1.5;
    },
    (f: any) => {
      f.confirmation.evidence.pages[0].hasImages = "yes";
    },
    (f: any) => {
      f.rows[0].confirmedValues.categoryId = "0";
    },
    (f: any) => {
      f.rows[0].expense.edited = null;
    },
    (f: any) => {
      f.rows[0].expense.deletedAt = "2026-02-30T00:00:00Z";
    },
    (f: any) => {
      f.rows[0].originalEvidence.normalized.date = "2026-02-30";
    },
    (f: any) => {
      f.rows[0].originalEvidence.duplicateReference = "private";
    },
    (f: any) => {
      f.rows[0].originalEvidence.referenceHash = "a".repeat(64);
    },
    (f: any) => {
      delete f.confirmation.excludedCount;
    },
  ];
  for (const mutate of mutations) {
    fixture = detailFixture();
    mutate(fixture);
    await assert.rejects(
      client.detail("42", "18"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
  }
});
test("list serializes exact confirmation dates, bounded page size and cursor", async (t) => {
  let url = "";
  t.mock.method(globalThis, "fetch", async (input) => {
    url = String(input);
    return Response.json({ items: [], nextCursor: null });
  });
  const client = createStatementImportHistoryApiClient({
    baseUrl: "https://example.invalid",
    getAccessToken: async () => "token",
  });
  await client.list("42", {
    fromDate: "2026-10-01",
    toDate: "2026-10-30",
    pageSize: 3,
    cursor: "next_page",
  });
  assert.equal(new URL(url).searchParams.get("cursor"), "next_page");
  assert.equal(new URL(url).searchParams.get("fromDate"), "2026-10-01");
  assert.equal(new URL(url).searchParams.get("toDate"), "2026-10-30");
  assert.equal(new URL(url).searchParams.get("pageSize"), "3");
  await assert.rejects(client.list("42", { pageSize: 101 }));
});
