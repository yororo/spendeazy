import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  invalidateCategoryDependentQueries,
  invalidateCategoryRuleQueries,
} from "./category-invalidation";
import {
  buildFinancialQueryKey,
  type FinancialQueryScope,
} from "./financial-query-scope";

const period = { year: 2026, month: 9 };

// Representative cached reads, including suffixes used by the feature queries.
// Keep these independent of the invalidator's prefix list so omissions fail.
function categoryDependentKeys(scope: FinancialQueryScope) {
  return [
    buildFinancialQueryKey(scope, ["categories", "overview"], period),
    buildFinancialQueryKey(scope, ["categories", "overview"], { year: 2026, month: 8 }),
    buildFinancialQueryKey(scope, ["categories", "rules"]),
    buildFinancialQueryKey(scope, ["categories", "budget"], "42"),
    buildFinancialQueryKey(scope, ["categories", "budget"], "43"),
    buildFinancialQueryKey(scope, ["dashboard"], period),
    buildFinancialQueryKey(scope, ["transactions"], period),
    buildFinancialQueryKey(scope, ["transactions", "deleted"]),
    buildFinancialQueryKey(scope, ["transaction-activity"], "transaction-1"),
    buildFinancialQueryKey(scope, ["statement-import", "categories"]),
    buildFinancialQueryKey(scope, ["statement-import", "rules"]),
    buildFinancialQueryKey(scope, ["statement-import", "recent"]),
  ];
}

function seedCache(queryClient: QueryClient, scope: FinancialQueryScope) {
  const affectedKeys = categoryDependentKeys(scope);
  const untouchedKeys = [
    ...categoryDependentKeys({ ...scope, identityId: "other-user" }),
    ...categoryDependentKeys({ ...scope, spaceId: "other-space" }),
    buildFinancialQueryKey(scope, ["unrelated"]),
  ];
  for (const key of [...affectedKeys, ...untouchedKeys]) {
    queryClient.setQueryData(key, { cached: true });
  }
  return { affectedKeys, untouchedKeys };
}

describe.each(["space-1", null])("Category cache invalidation in Space %s", (spaceId) => {
  const scope = { identityId: "user-1", spaceId };

  it("marks all dependent reads stale without changing other Users, Spaces, or unrelated reads", async () => {
    const queryClient = new QueryClient();
    try {
      const { affectedKeys, untouchedKeys } = seedCache(queryClient, scope);

      await invalidateCategoryDependentQueries(queryClient, scope);

      for (const key of affectedKeys) {
        expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
        expect(queryClient.getQueryData(key)).toEqual({ cached: true });
      }
      for (const key of untouchedKeys) {
        expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
      }
    } finally {
      queryClient.clear();
    }
  });

  it("marks only the two Category Rule reads stale", async () => {
    const queryClient = new QueryClient();
    try {
      const { affectedKeys, untouchedKeys } = seedCache(queryClient, scope);

      await invalidateCategoryRuleQueries(queryClient, scope);

      for (const key of affectedKeys) {
        expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(
          key[1] === "rules",
        );
      }
      for (const key of untouchedKeys) {
        expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
      }
    } finally {
      queryClient.clear();
    }
  });
});

it("refreshes an active dependent read even while its cached value is otherwise fresh", async () => {
  const queryClient = new QueryClient();
  const scope = { identityId: "user-1", spaceId: "space-1" };
  const queryKey = buildFinancialQueryKey(scope, ["categories", "budget"], "42");
  queryClient.setQueryData(queryKey, { amount: "25.00" });
  const observer = new QueryObserver(queryClient, {
    queryKey,
    staleTime: Infinity,
    queryFn: async () => ({ amount: "50.00" }),
  });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await invalidateCategoryDependentQueries(queryClient, scope);

    expect(observer.getCurrentResult().data).toEqual({ amount: "50.00" });
    expect(observer.getCurrentResult().isStale).toBe(false);
  } finally {
    unsubscribe();
    queryClient.clear();
  }
});
