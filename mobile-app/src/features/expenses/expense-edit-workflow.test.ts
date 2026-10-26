import assert from "node:assert/strict";
import test from "node:test";
import {
  ExpenseApiError,
  ExpenseApiTransportError,
} from "../../api/request-failure.ts";
import type { ListedExpense } from "../../api/expense-response.ts";
import { createExpenseEditWorkflow } from "./expense-edit-workflow.ts";

const categories = {
  spaceId: "space-1",
  items: [
    { id: "food", isActive: true },
    { id: "inactive", isActive: false },
    { id: "transport", isActive: true },
  ],
};

test("validates, saves only changed fields, and closes after success", async () => {
  const calls: unknown[] = [];
  const workflow = createExpenseEditWorkflow(
    { spaceId: "space-1" },
    () => true,
    {
      read: async () => expense({ description: "remote" }),
      update: async (_spaceId, _expenseId, input) => {
        calls.push(input);
        return expense({
          description: input.description ?? "remote",
          revision: "2",
        });
      },
    },
    () => new Date("2026-10-26T00:00:00.000Z"),
  );
  workflow.begin(expense());
  assert.deepEqual(workflow.snapshot().draft, {
    amount: "10.00",
    description: "Cafe",
    categoryId: "food",
    expenseDate: "2026-10-24",
  });
  workflow.update({ description: "  Market corrected  " });
  assert.equal(await workflow.submit(categories), "saved");
  assert.deepEqual(calls, [
    { expectedRevision: "1", description: "Market corrected" },
  ]);
  assert.equal(workflow.snapshot().open, false);
});

test("retains a draft on validation and request failures", async () => {
  let failure: Error | null = null;
  const workflow = createExpenseEditWorkflow(
    { spaceId: "space-1" },
    () => true,
    {
      read: async () => expense(),
      update: async () => {
        if (failure) throw failure;
        return expense();
      },
    },
    () => new Date("2026-10-26T00:00:00.000Z"),
  );
  workflow.begin(expense());
  workflow.update({ amount: "0" });
  assert.equal(await workflow.submit(categories), "invalid");
  assert.equal(workflow.snapshot().draft?.amount, "0");
  assert.ok(workflow.snapshot().issues.amount);

  workflow.update({ amount: "12.50" });
  failure = new ExpenseApiTransportError();
  assert.equal(await workflow.submit(categories), "failed");
  assert.equal(workflow.snapshot().draft?.amount, "12.50");
  assert.match(workflow.snapshot().error ?? "", /still here/);
});

test("keeps an unchanged inactive Category and requires active categories for reassignment", async () => {
  const workflow = createExpenseEditWorkflow(
    { spaceId: "space-1" },
    () => true,
    {
      read: async () => expense({ categoryId: "inactive" }),
      update: async () => expense(),
    },
    () => new Date("2026-10-26T00:00:00.000Z"),
  );
  workflow.begin(expense({ categoryId: "inactive" }));
  workflow.update({ description: "Still in the old Category" });
  assert.equal(await workflow.submit(categories), "saved");

  workflow.begin(expense());
  workflow.update({ categoryId: "inactive" });
  assert.equal(await workflow.submit(categories), "invalid");
  assert.match(workflow.snapshot().issues.categoryId ?? "", /active Category/);
});

test("conflicts require review and explicit continuation, rebasing untouched fields", async () => {
  let latest = expense({
    description: "Other edit",
    amount: "20.00",
    revision: "2",
  });
  const calls: unknown[] = [];
  let firstSave = true;
  const workflow = createExpenseEditWorkflow(
    { spaceId: "space-1" },
    () => true,
    {
      read: async () => latest,
      update: async (_spaceId, _expenseId, input) => {
        calls.push(input);
        if (firstSave) {
          firstSave = false;
          throw new ExpenseApiError(409, "STALE_EDIT", "Expense changed.");
        }
        return expense({ ...latest, ...input, revision: "3" });
      },
    },
    () => new Date("2026-10-26T00:00:00.000Z"),
  );
  workflow.begin(expense());
  workflow.update({ description: "My description" });
  assert.equal(await workflow.submit(categories), "conflict");
  assert.equal(workflow.snapshot().draft?.amount, "10.00");
  assert.equal(workflow.snapshot().base?.revision, "1");
  assert.equal(await workflow.reviewLatest(), true);
  assert.equal(workflow.snapshot().latest?.amount, "20.00");
  assert.equal(workflow.snapshot().draft?.description, "My description");
  assert.equal(workflow.snapshot().draft?.amount, "20.00");
  assert.equal(await workflow.submit(categories), "busy");
  workflow.continueWithMyChanges();
  assert.equal(await workflow.submit(categories), "saved");
  assert.deepEqual(calls, [
    { expectedRevision: "1", description: "My description" },
    { expectedRevision: "2", description: "My description" },
  ]);
});

const expense = (overrides: Partial<ListedExpense> = {}): ListedExpense => ({
  id: "expense-1",
  categoryId: "food",
  expenseDate: "2026-10-24",
  description: "Cafe",
  amount: "10.00",
  source: "imported",
  addedByUserId: "user-1",
  statementImportId: "import-1",
  sourceRowId: "row-1",
  createdAt: "2026-10-24T00:00:00.000Z",
  updatedAt: "2026-10-24T00:00:00.000Z",
  revision: "1",
  ...overrides,
});
