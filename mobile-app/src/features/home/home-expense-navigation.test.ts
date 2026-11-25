import assert from "node:assert/strict";
import test from "node:test";

import { homeExpenseFilterBelongsToSpace } from "./home-expense-navigation.ts";

test("Home Expense filters stay scoped to the Space that opened them", () => {
  assert.equal(homeExpenseFilterBelongsToSpace("4", "4"), true);
  assert.equal(homeExpenseFilterBelongsToSpace("4", "9"), false);
  assert.equal(homeExpenseFilterBelongsToSpace("4", null), false);
  assert.equal(homeExpenseFilterBelongsToSpace(null, "4"), false);
});
