import assert from "node:assert/strict";
import test from "node:test";
import type { StatementImportDetail } from "../../api/statement-import-history-api-client.ts";
import { ExpenseApiError } from "../../api/request-failure.ts";
import {
  createImportDetailWorkflow,
  importRouteScope,
} from "./detail-workflow.ts";

const detail = {
  id: "8",
  currentExpenses: { count: "1", totalAmount: "150.00" },
} as StatementImportDetail;
test("route scope requires scalar positive IDs and the explicitly selected source Space", () => {
  assert.deepEqual(
    importRouteScope({ sourceSpaceId: "7", statementImportId: "8" }, "7"),
    { sourceSpaceId: "7", statementImportId: "8" },
  );
  for (const sourceSpaceId of [undefined, ["7"], "0", "07", "9"])
    assert.equal(
      importRouteScope({ sourceSpaceId, statementImportId: "8" }, "7"),
      null,
    );
  for (const statementImportId of [undefined, ["8"], "-8", "8.0"])
    assert.equal(
      importRouteScope({ sourceSpaceId: "7", statementImportId }, "7"),
      null,
    );
});
test("replacement, cancellation and obsolete identity prevent stale success/error completion", async () => {
  const pending: {
    resolve: (d: StatementImportDetail) => void;
    reject: (e: unknown) => void;
  }[] = [];
  let current = true;
  const workflow = createImportDetailWorkflow(
    () => current,
    () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  );
  const first = workflow.refresh();
  const second = workflow.refresh();
  pending[0].reject(Error("late failure"));
  await first;
  assert.equal(workflow.snapshot().loading, true);
  pending[1].resolve(detail);
  await second;
  assert.equal(workflow.snapshot().detail, detail);
  const cancelled = workflow.refresh();
  workflow.cancel();
  pending[2].resolve({ ...detail, id: "99" });
  await cancelled;
  assert.equal(workflow.snapshot().detail?.id, "8");
  const obsolete = workflow.refresh();
  current = false;
  pending[3].reject(Error("signed out"));
  await obsolete;
  assert.equal(workflow.snapshot().detail, null);
});
test("missing record is unavailable; retry loads it and focus refresh replaces current projection", async () => {
  let failure = true;
  const workflow = createImportDetailWorkflow(
    () => true,
    async () => {
      if (failure) throw new ExpenseApiError(404, "NOT_FOUND", "Missing");
      return detail;
    },
  );
  await workflow.refresh();
  assert.equal(workflow.snapshot().unavailable, true);
  failure = false;
  await workflow.refresh();
  assert.equal(
    workflow.snapshot().detail?.currentExpenses.totalAmount,
    "150.00",
  );
  assert.equal(workflow.snapshot().error, null);
});
