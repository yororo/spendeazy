import assert from "node:assert/strict";
import test from "node:test";

import {
  barHeightPercent,
  compareMoney,
  dashboardPeriodLabel,
  formatPhp,
  shiftMonth,
} from "./dashboard-format.ts";

test("Dashboard formats PHP values without losing cent precision", () => {
  assert.equal(formatPhp("12500.00"), "₱12,500.00");
  assert.equal(formatPhp("-1234.56"), "-₱1,234.56");
  assert.throws(() => formatPhp("1.234"));
});

test("Dashboard period labels keep Manila progress context and shift calendar months", () => {
  const report = {
    range: {
      view: "monthly",
      fromDate: "2025-11-01",
      toDate: "2026-04-26",
      inProgress: true,
    },
    monthlyExpenses: [
      { month: "2025-11" },
      { month: "2025-12" },
      { month: "2026-01" },
      { month: "2026-02" },
      { month: "2026-03" },
      { month: "2026-04" },
    ],
  } as Parameters<typeof dashboardPeriodLabel>[0];
  assert.equal(
    dashboardPeriodLabel(report),
    "Nov – Apr 2025 – 2026 · In progress",
  );
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
});

test("Dashboard chart scaling and ordering use exact cents strings", () => {
  assert.equal(compareMoney("125.00", "124.99"), 1);
  assert.equal(barHeightPercent("50.00", "200.00"), 25);
  assert.equal(barHeightPercent("1.00", "0.00"), 0);
});
