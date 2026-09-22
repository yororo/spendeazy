import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  invalidateCategoryDependentQueries,
  invalidateCategoryRuleQueries,
} from "./category-invalidation";

const scope = { identityId: "user-1", spaceId: "space-1" } as const;

describe("Category-dependent cache invalidation", () => {
  it("invalidates all feature data that displays Category Colors", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateCategoryDependentQueries(queryClient, scope);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["categories", "overview", "user-1", "space-1"],
      ["categories", "rules", "user-1", "space-1"],
      ["categories", "budget", "user-1", "space-1"],
      ["dashboard", "user-1", "space-1"],
      ["transactions", "user-1", "space-1"],
      ["transactions", "deleted", "user-1", "space-1"],
      ["transaction-activity", "user-1", "space-1"],
      ["statement-import", "categories", "user-1", "space-1"],
      ["statement-import", "rules", "user-1", "space-1"],
      ["statement-import", "recent", "user-1", "space-1"],
    ]);
  });
});

describe("Category Rule cache invalidation", () => {
  it("invalidates the Categories and Statement Import rule caches", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateCategoryRuleQueries(queryClient, scope);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["categories", "rules", "user-1", "space-1"],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["statement-import", "rules", "user-1", "space-1"],
    });
  });
});
