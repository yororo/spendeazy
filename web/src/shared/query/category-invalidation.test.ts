import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  invalidateCategoryDependentQueries,
  invalidateCategoryRuleQueries,
} from "./category-invalidation";

describe("Category-dependent cache invalidation", () => {
  it("invalidates all feature data that displays Category Colors", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateCategoryDependentQueries(queryClient);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["categories"],
      ["dashboard"],
      ["transactions"],
      ["statement-import"],
    ]);
  });
});

describe("Category Rule cache invalidation", () => {
  it("invalidates the Categories and Statement Import rule caches", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateCategoryRuleQueries(queryClient);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["categories", "rules"],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["statement-import", "rules"],
    });
  });
});
