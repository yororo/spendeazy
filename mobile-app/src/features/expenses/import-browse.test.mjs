import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const compiled = await build({
  stdin: {
    contents: `export { useExpenseBrowse } from './use-expense-browse'; export * from './browse-state';`,
    resolveDir: dirname(fileURLToPath(import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [
    {
      name: "boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@\// }, ({ path }) => ({
          path,
          external: true,
        }));
      },
    },
  ],
});
const calls = [];
let active = { id: "7" };
let scope = { generation: 1, userId: "tester", spaceId: "7" };
let authorized = { scope, isCurrent: () => true };
const categories = [];
const api = Object.fromEntries(
  ["listExpenses", "listDeletedExpenses"].map((method) => [
    method,
    async (spaceId, query) => {
      calls.push({ method, spaceId, query });
      return {
        expenses: [{ id: query.cursor ? "2" : "1" }],
        nextCursor: query.cursor ? null : "next",
        totalCount: "2",
        totalAmount: "300.00",
      };
    },
  ]),
);
const module = { exports: {} };
new Function("require", "module", compiled.outputFiles[0].text)((name) => {
  if (name === "@/api/expense-api-client")
    return { createExpenseApiClient: () => api };
  if (name === "@/application/authorized-client")
    return { useAuthorizedClient: () => authorized };
  if (name === "@/application/spaces/provider")
    return { useSpaces: () => ({ active, refresh() {} }) };
  if (name === "@/api/categories-api-client")
    return {
      createCategoriesApiClient: () => ({
        listCategories: async () => categories,
      }),
    };
  if (name === "@/application/session-resource")
    return {
      createSessionResource: () => ({
        subscribe: () => () => {},
        snapshot: () => categoryState,
        load: async () => {},
        cancel() {},
      }),
    };
  if (name === "@/application/session-runtime") return { session: {} };
  return require(name);
}, module);
const categoryState = { data: categories, error: null };
const {
  useExpenseBrowse,
  updateExpenseBrowse,
  expenseBrowseSnapshot,
  noteManualExpenseSaved,
} = module.exports;

test("import browsing isolates global filters/scroll, fixes import on every page and separates deleted mode and identity", async () => {
  updateExpenseBrowse("7", {
    fromDate: "2020-01-01",
    toDate: "2020-01-02",
    description: "Unrelated",
    categoryId: "9",
  });
  const globalSelection = expenseBrowseSnapshot().selection;
  const fixedScope = { sourceSpaceId: "7", statementImportId: "8" };
  let controller;
  function Harness({ deletedOnly = false }) {
    controller = useExpenseBrowse({ fixedScope, deletedOnly });
    return null;
  }
  let tree;
  await act(async () => {
    tree = create(React.createElement(Harness));
  });
  assert.deepEqual(calls.at(-1), {
    method: "listExpenses",
    spaceId: "7",
    query: { statementImportId: "8", sort: "newest", pageSize: 20 },
  });
  await act(async () => controller.loadMore());
  assert.equal(calls.at(-1).query.statementImportId, "8");
  assert.equal(calls.at(-1).query.cursor, "next");
  assert.equal(controller.loaded.expenses.length, 2);
  const beforeMutation = calls.length;
  await act(async () => noteManualExpenseSaved());
  assert.equal(calls.length, beforeMutation + 1);
  assert.equal(calls.at(-1).query.cursor, undefined);
  assert.equal(calls.at(-1).query.statementImportId, "8");
  await act(async () => controller.updateSelection({ description: "Local" }));
  assert.equal(calls.at(-1).query.description, "Local");
  assert.equal(calls.at(-1).query.cursor, undefined);
  controller.rememberScroll(250);
  assert.equal(controller.readScroll(), 250);
  await act(async () =>
    tree.update(React.createElement(Harness, { deletedOnly: true })),
  );
  assert.equal(calls.at(-1).method, "listDeletedExpenses");
  assert.equal(calls.at(-1).query.description, undefined);
  assert.equal(controller.readScroll(), 0);
  assert.equal(expenseBrowseSnapshot().selection, globalSelection);
  const count = calls.length;
  active = { id: "9" };
  scope = { generation: 2, userId: "tester", spaceId: "9" };
  authorized = { scope, isCurrent: () => true };
  await act(async () =>
    tree.update(React.createElement(Harness, { deletedOnly: true })),
  );
  assert.equal(controller.spaceId, null);
  assert.equal(controller.loaded, null);
  assert.equal(calls.length, count);
  await act(async () => tree.unmount());
});
