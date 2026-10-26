import assert from "node:assert/strict";
import test from "node:test";

import { dashboardExpenseFilterBelongsToSpace } from "./dashboard-expense-navigation.ts";

test("Dashboard Expense filters stay scoped to the Space that opened them", () => {
  assert.equal(dashboardExpenseFilterBelongsToSpace("4", "4"), true);
  assert.equal(dashboardExpenseFilterBelongsToSpace("4", "9"), false);
  assert.equal(dashboardExpenseFilterBelongsToSpace("4", null), false);
  assert.equal(dashboardExpenseFilterBelongsToSpace(null, "4"), false);
});
