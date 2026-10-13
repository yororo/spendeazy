import { describe, expect, it } from "vitest";

import { getCategoryBudgetReadiness } from "./category-budget-readiness";
import type { CategoryBudget } from "./categories-service";

const budget: CategoryBudget = {
  amount: "100.00",
  period: "monthly",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("authoritative Budget readiness", () => {
  it.each([undefined, null, budget])("waits for the mount fetch despite cached %j", (data) => {
    expect(getCategoryBudgetReadiness({
      isFetchedAfterMount: false, isError: false, error: null, data,
    })).toEqual({ status: "loading" });
  });

  it.each([undefined, null, budget])("shows a pre-fetch error despite cached %j", (data) => {
    expect(getCategoryBudgetReadiness({
      isFetchedAfterMount: false, isError: true, error: new Error("Load failed"), data,
    })).toEqual({ status: "error", message: "Load failed" });
  });

  it("uses the fallback when a pre-fetch error has no message source", () => {
    expect(getCategoryBudgetReadiness({
      isFetchedAfterMount: false, isError: true, error: null, data: undefined,
    })).toEqual({ status: "error", message: "Try again to load Budget details." });
  });

  it.each([false, true])("uses the fallback for missing fetched data with isError=%s", (isError) => {
    expect(getCategoryBudgetReadiness({
      isFetchedAfterMount: true, isError, error: new Error("Load failed"), data: undefined,
    })).toEqual({ status: "error", message: "Try again to load Budget details." });
  });

  it.each([
    { data: null, isError: false },
    { data: null, isError: true },
    { data: budget, isError: false },
    { data: budget, isError: true },
  ])("accepts fetched $data with isError=$isError", ({ data, isError }) => {
    expect(getCategoryBudgetReadiness({
      isFetchedAfterMount: true, isError, error: isError ? new Error("Refetch failed") : null, data,
    })).toEqual({ status: "ready", budget: data });
  });
});
