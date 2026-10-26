import assert from "node:assert/strict";
import test from "node:test";
import { createExpenseApiClient } from "./expense-api-client.ts";
import { requestFailure } from "./request-failure.ts";

const expense = {
  id: "1",
  categoryId: "2",
  expenseDate: "2026-10-24",
  description: "Cafe",
  amount: "10.00",
  source: "manual",
  createdAt: "now",
  updatedAt: "now",
  revision: "1",
  transportOnly: true,
};
const options = {
  baseUrl: "https://example.invalid",
  getAccessToken: async () => "token",
};

test("Expense detail and pages return the same decoded application model", async (t) => {
  const client = createExpenseApiClient(options);
  t.mock.method(globalThis, "fetch", async () => Response.json(expense));
  const detail = await client.getExpense("personal", "1");
  assert.equal(detail.addedByUserId, null);
  assert.equal("transportOnly" in detail, false);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      expenses: [expense],
      nextCursor: null,
      totalCount: "1",
      totalAmount: "10.00",
    }),
  );
  assert.deepEqual((await client.listExpenses("personal")).expenses, [detail]);
  assert.deepEqual((await client.listDeletedExpenses("personal")).expenses, [
    detail,
  ]);
});

test("malformed Expense detail and pages are invalid responses", async (t) => {
  const client = createExpenseApiClient(options);
  for (const payload of [
    { ...expense, amount: 10 },
    { expenses: [expense], totalCount: "1", totalAmount: "10.00" },
  ]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(
      client.listExpenses("personal"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
    await assert.rejects(
      client.getExpense("personal", "1"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
    t.mock.restoreAll();
  }
});

test("deleted Expense reads preserve the deletion timestamp in detail and pages", async (t) => {
  const deleted = { ...expense, deletedAt: "2026-10-24T03:00:00.000Z" };
  const client = createExpenseApiClient(options);
  t.mock.method(globalThis, "fetch", async () => Response.json(deleted));
  assert.equal(
    (await client.getExpense("personal", "1")).deletedAt,
    deleted.deletedAt,
  );
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      expenses: [deleted],
      nextCursor: null,
      totalCount: "1",
      totalAmount: "10.00",
    }),
  );
  assert.equal(
    (await client.listDeletedExpenses("personal")).expenses[0].deletedAt,
    deleted.deletedAt,
  );
});

test("malformed money and totals are rejected before reaching the browse view", async (t) => {
  const client = createExpenseApiClient(options);
  for (const amount of ["ten", "-1.00", "0.00", "1.001"]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ ...expense, amount }),
    );
    await assert.rejects(
      client.getExpense("personal", "1"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        expenses: [{ ...expense, amount }],
        nextCursor: null,
        totalCount: "1",
        totalAmount: "10.00",
      }),
    );
    await assert.rejects(
      client.listExpenses("personal"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
    t.mock.restoreAll();
  }
  for (const totals of [
    { totalCount: "many", totalAmount: "10.00" },
    { totalCount: "1", totalAmount: "ten" },
  ]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ expenses: [expense], nextCursor: null, ...totals }),
    );
    await assert.rejects(
      client.listExpenses("personal"),
      (cause) => requestFailure(cause) === "invalid-response",
    );
    t.mock.restoreAll();
  }
});

test("manual creation decodes its successful response and rejects malformed success without replaying POST", async (t) => {
  const client = createExpenseApiClient(options);
  const input = {
    expenseDate: "2026-10-24",
    description: "Cafe",
    amount: "10.00",
    categoryId: "2",
  };
  let posts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    posts++;
    return Response.json({ ...expense, amount: 10 });
  });
  await assert.rejects(
    client.createManualExpense("personal", input),
    (cause) => requestFailure(cause) === "invalid-response",
  );
  assert.equal(posts, 1);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json(expense));
  const created = await client.createManualExpense("personal", input);
  assert.equal(created.id, "1");
  assert.equal(created.amount, "10.00");
  assert.equal("transportOnly" in created, false);
});

test("edit and delete responses decode the retained Expense and Activity snapshots", async (t) => {
  const client = createExpenseApiClient(options);
  const imported = {
    ...expense,
    source: "imported",
    statementImportId: "18",
    sourceRowId: "row-9",
    addedByUserId: "7",
  };
  let calls: Request[] = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    calls.push(new Request(input, init));
    return Response.json({ ...imported, amount: "12.50", revision: "2" });
  });
  const updated = await client.updateExpense("space", "1", {
    expectedRevision: "1",
    amount: "12.50",
  });
  assert.equal(updated.sourceRowId, "row-9");
  assert.equal(updated.statementImportId, "18");
  assert.deepEqual(await calls[0].json(), {
    expectedRevision: "1",
    amount: "12.50",
  });
  t.mock.restoreAll();

  t.mock.method(globalThis, "fetch", async (input, init) => {
    calls.push(new Request(input, init));
    return Response.json({
      ...imported,
      deletedAt: "2026-10-24T03:00:00.000Z",
      revision: "3",
    });
  });
  const deleted = await client.deleteExpense("space", "1", "2");
  assert.equal(deleted.deletedAt, "2026-10-24T03:00:00.000Z");
  assert.equal(new Headers(calls[1].headers).get("if-match"), '"2"');
  t.mock.restoreAll();

  t.mock.method(globalThis, "fetch", async () =>
    Response.json([
      {
        id: "3",
        expenseId: "1",
        type: "edited",
        actorUserId: "8",
        occurredAt: "now",
        before: {
          categoryId: "2",
          expenseDate: "2026-10-23",
          description: "Old",
          amount: "10.00",
        },
        after: {
          categoryId: "4",
          expenseDate: "2026-10-24",
          description: "New",
          amount: "12.50",
        },
      },
    ]),
  );
  const activity = await client.listExpenseActivity("space", "1");
  assert.equal(activity[0].before?.description, "Old");
  assert.equal(activity[0].after?.categoryId, "4");
});
