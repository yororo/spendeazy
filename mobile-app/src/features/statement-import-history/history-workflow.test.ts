import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_DATES,
  createHistoryWorkflow,
  filterError,
  routeHistoryFilters,
} from "./history-workflow.ts";
import {
  dashboardHistoryTarget,
  importDetailPath,
} from "./history-navigation.ts";
import type { StatementImportHistoryPage } from "../../api/statement-import-history-api-client.ts";

function deferred() {
  let resolve!: (page: StatementImportHistoryPage) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<StatementImportHistoryPage>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const page = (
  cursor: string | null,
  ids: string[] = [],
): StatementImportHistoryPage => ({
  items: ids.map((id) => ({
    id,
    fileName: `${id}.pdf`,
    statementDate: null,
    provider: "gcash",
    accountFormat: "wallet",
    statementType: "e_wallet",
    historyFromDate: null,
    historyToDate: "2026-10-30",
    totalDebit: null,
    importedAt: "2026-10-30T00:00:00Z",
    importedByUserId: "7",
    expenseCount: "1",
    originalExpenseCount: "1",
  })),
  nextCursor: cursor,
});
test("refresh supersedes append including late failures and cleanup; append retry retains cursor", async () => {
  const requests: ReturnType<typeof deferred>[] = [],
    queries: unknown[] = [];
  const workflow = createHistoryWorkflow(
    "7",
    ALL_DATES,
    () => true,
    async (_, query) => {
      queries.push(query);
      const next = deferred();
      requests.push(next);
      return next.promise;
    },
  );
  const first = workflow.refresh();
  requests[0].resolve(page("first", ["1"]));
  await first;
  const append = workflow.loadMore(),
    refresh = workflow.refresh();
  requests[2].resolve(page("fresh", ["2"]));
  await refresh;
  requests[1].reject(Error("late"));
  await append;
  assert.equal(workflow.snapshot().page?.nextCursor, "fresh");
  assert.equal(workflow.snapshot().error, null);
  const failed = workflow.loadMore();
  requests[3].reject(Error("offline"));
  await failed;
  assert.ok(workflow.snapshot().error);
  const retry = workflow.retry();
  assert.deepEqual(queries[4], { pageSize: 100, cursor: "fresh" });
  requests[4].resolve(page(null, ["3"]));
  await retry;
  assert.equal(workflow.snapshot().error, null);
  assert.deepEqual(
    workflow.snapshot().page?.items.map((item) => item.id),
    ["2", "3"],
  );
});
test("replacement and cancellation reject stale completions, and return leaves loaded pages intact", async () => {
  const requests: ReturnType<typeof deferred>[] = [];
  const w = createHistoryWorkflow(
    "7",
    ALL_DATES,
    () => true,
    async () => {
      const next = deferred();
      requests.push(next);
      return next.promise;
    },
  );
  const old = w.refresh();
  w.cancel();
  const next = w.refresh();
  requests[0].resolve(page("old"));
  await old;
  assert.equal(w.snapshot().page, null);
  requests[1].resolve(page("new"));
  await next;
  const retained = w.snapshot();
  assert.equal(w.snapshot(), retained);
});
test("filter, Space A→B→A and identity lifetimes never reuse pending pages", async () => {
  let generation = 1;
  const pending = deferred();
  const oldA = createHistoryWorkflow(
    "7",
    ALL_DATES,
    () => generation === 1,
    () => pending.promise,
  );
  const load = oldA.refresh();
  generation++;
  const b = createHistoryWorkflow(
    "8",
    ALL_DATES,
    () => generation === 2,
    async () => page(null),
  );
  assert.equal(b.snapshot().page, null);
  generation++;
  const newA = createHistoryWorkflow(
    "7",
    { fromDate: "2026-10-01", toDate: "" },
    () => generation === 3,
    async () => page("filtered"),
  );
  pending.resolve(page("stale"));
  await load;
  assert.equal(oldA.snapshot().page, null);
  assert.equal(newA.snapshot().page, null);
  await newA.refresh();
  assert.equal(newA.snapshot().page?.nextCursor, "filtered");
  generation++;
  assert.equal(newA.snapshot().page, null);
});
test("invalid filters do not fetch; route filters require exact source Space and scalar calendar dates", async () => {
  assert.ok(filterError({ fromDate: "2026-02-30", toDate: "" }));
  assert.ok(filterError({ fromDate: "2026-10-31", toDate: "2026-10-01" }));
  let calls = 0;
  const w = createHistoryWorkflow(
    "7",
    { fromDate: "bad", toDate: "" },
    () => true,
    async () => {
      calls++;
      return page(null);
    },
  );
  await w.refresh();
  assert.equal(calls, 0);
  assert.deepEqual(routeHistoryFilters({}, "7"), ALL_DATES);
  assert.deepEqual(
    routeHistoryFilters({ sourceSpaceId: "8", fromDate: "2026-10-01" }, "7"),
    ALL_DATES,
  );
  assert.deepEqual(
    routeHistoryFilters({ sourceSpaceId: "7", fromDate: ["2026-10-01"] }, "7"),
    ALL_DATES,
  );
  const filter = { fromDate: "2026-08-13", toDate: "2026-09-12" };
  const target = dashboardHistoryTarget("7", filter);
  assert.deepEqual(target.params, { sourceSpaceId: "7", ...filter });
  assert.deepEqual(routeHistoryFilters(target.params, "7"), filter);
  assert.equal(
    importDetailPath("7", "123"),
    "/statement-import/123?sourceSpaceId=7",
  );
});
