import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const compiled = await build({
  entryPoints: [
    fileURLToPath(
      new URL("./statement-import-detail-view.tsx", import.meta.url),
    ),
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
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
const module = { exports: {} };
new Function("require", "module", compiled.outputFiles[0].text)((name) => {
  if (name === "react-native")
    return {
      View: "View",
      Text: "Text",
      RefreshControl: "RefreshControl",
      FlatList: ({ data, renderItem, ListHeaderComponent }) =>
        React.createElement(
          "List",
          {},
          ListHeaderComponent,
          data.map((item) =>
            React.createElement(
              React.Fragment,
              { key: item.sourceRowId },
              renderItem({ item }),
            ),
          ),
        ),
    };
  if (name === "react-native-safe-area-context")
    return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  if (name === "@/components/buttons")
    return {
      SecondaryButton: ({ label, ...props }) =>
        React.createElement("Action", { label, ...props }),
    };
  if (name === "@/components/screen")
    return {
      BodyText: "Body",
      SupportingText: "Supporting",
      StackGap: "Stack",
    };
  if (name === "@/components/screen-header") return { ScreenHeader: "Header" };
  if (name === "@/components/design-surface")
    return { CanvasBackground: "Canvas", DesignSurface: "Surface" };
  if (name === "@/constants/theme")
    return { space: { cardGap: 14, screenHorizontal: 20 } };
  if (name === "@/navigation/app-theme")
    return { useAppTheme: () => ({ palette: {}, fonts: {} }) };
  if (name === "@/application/spaces/active-space")
    return { spaceIdentityLabel: () => "Archived Shared" };
  return require(name);
}, module);
const { StatementImportDetailView } = module.exports;
const row = {
  sourceRowId: "r1",
  disposition: "included",
  originalEvidence: {
    sourceOrder: 0,
    pageIndex: 0,
    original: {
      description: "Fictional purchase",
      dateText: "Jan 1",
      postingDateText: null,
      amountText: "100.00",
      balanceText: null,
    },
    normalized: { date: "2026-01-01", amount: "100.00" },
    classification: "purchase",
    classificationEvidence: [],
  },
  confirmedValues: {
    expenseDate: "2026-01-01",
    description: "Reviewed purchase",
    amount: "100.00",
    categoryId: "5",
  },
  expense: { id: "9", edited: true, deletedAt: "2026-01-02T16:00:00.000Z" },
};
const detail = {
  id: "8",
  provider: "bdo",
  statementType: "credit_card",
  accountFormat: "amex",
  fileName: "fictional.pdf",
  statementDate: "2026-01-01",
  historyFromDate: null,
  historyToDate: null,
  importedAt: "2026-01-01T16:00:00.000Z",
  currentExpenses: { count: "1", totalAmount: "150.00" },
  confirmation: {
    originalExpenseCount: "2",
    originalExpenseTotal: "300.00",
    includedCount: "2",
    excludedCount: "1",
    acknowledgedWarnings: [],
    evidence: {
      controlTotals: [
        { key: "debit", label: "Total Debit", amount: null, originalText: "?" },
      ],
      reconciliation: {
        status: "unavailable",
        comparisons: [],
        diagnostics: [
          {
            code: "partial",
            message: "Fictional unreadable page",
            pageIndices: [1],
            sourceRowIds: [],
          },
        ],
      },
      completeness: {
        assessment: "partial",
        failedPageIndices: [1],
        unreadablePageIndices: [],
      },
      parserVersion: "1",
      extractionEngineVersion: "1",
    },
  },
  rows: [
    row,
    {
      ...row,
      sourceRowId: "r2",
      disposition: "excluded",
      confirmedValues: null,
      expense: null,
      exclusion: { reason: "Refund", automatic: true },
    },
  ],
};
const controller = {
  detail,
  active: { id: "7", status: "archived", accessLevel: "read" },
  categoryName: () => "Renamed Category",
  importer: "Deleted user",
  refresh() {},
};

test("original/current values, retained excluded rows and overlapping edited/deleted status stay independently visible", async () => {
  let tree;
  const opened = [];
  const modes = [];
  await act(async () => {
    tree = create(
      React.createElement(StatementImportDetailView, {
        controller,
        onBack() {},
        onExpenses: (m) => modes.push(m),
        onExpense: (id) => opened.push(id),
      }),
    );
  });
  const text = () => JSON.stringify(tree.toJSON());
  assert.match(text(), /Originally confirmed Expenses/);
  assert.match(text(), /2 Expenses · PHP 300.00/);
  assert.match(text(), /1 nondeleted Expenses · PHP 150.00/);
  assert.match(text(), /Deleted user/);
  assert.match(text(), /read-only/);
  assert.match(text(), /Unavailable \/ unparseable/);
  assert.match(text(), /Jan 2, 2026/);
  const action = (label) =>
    tree.root.findAllByType("Action").find((n) => n.props.label === label);
  await act(async () => action("View current Expenses").props.onPress());
  await act(async () => action("View deleted Expenses").props.onPress());
  assert.deepEqual(modes, ["active", "deleted"]);
  await act(async () => action("Show all 2 original rows").props.onPress());
  assert.match(text(), /Edited since confirmation/);
  assert.match(text(), /Deleted · Jan 3, 2026/);
  assert.match(text(), /Excluded: Refund · Automatic/);
  assert.match(text(), /Renamed Category/);
  await act(async () =>
    action("Inspect deleted Expense and Activity").props.onPress(),
  );
  assert.deepEqual(opened, ["9"]);
  await act(async () => tree.unmount());
});

test("legacy detail retains current actions and failure/unavailable states expose retry and Back", async () => {
  let tree;
  let retries = 0;
  const props = {
    controller: {
      ...controller,
      detail: { ...detail, confirmation: null, rows: [] },
    },
    onBack() {},
    onExpenses() {},
    onExpense() {},
  };
  await act(async () => {
    tree = create(React.createElement(StatementImportDetailView, props));
  });
  assert.match(
    JSON.stringify(tree.toJSON()),
    /Original confirmation result unavailable/,
  );
  assert.equal(
    tree.root
      .findAllByType("Action")
      .some((n) => n.props.label === "View current Expenses"),
    true,
  );
  await act(async () =>
    tree.update(
      React.createElement(StatementImportDetailView, {
        ...props,
        controller: {
          ...controller,
          detail: null,
          error: "Missing",
          unavailable: true,
          refresh: () => retries++,
        },
      }),
    ),
  );
  assert.match(
    JSON.stringify(tree.toJSON()),
    /Statement Import is unavailable/,
  );
  await act(async () =>
    tree.root
      .findAllByType("Action")
      .find((n) => n.props.label === "Retry")
      .props.onPress(),
  );
  assert.equal(retries, 1);
  await act(async () => tree.unmount());
});
