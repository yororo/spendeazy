import type { QueryClient } from "@tanstack/react-query";

const CATEGORY_DEPENDENT_QUERY_KEYS = [
  ["categories"],
  ["dashboard"],
  ["transactions"],
  ["statement-import"],
] as const;
const CATEGORY_RULE_QUERY_KEYS = [
  ["categories", "rules"],
  ["statement-import", "rules"],
] as const;

async function invalidateCategoryDependentQueries(queryClient: QueryClient) {
  await Promise.all(
    CATEGORY_DEPENDENT_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

async function invalidateCategoryRuleQueries(queryClient: QueryClient) {
  await Promise.all(
    CATEGORY_RULE_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export {
  CATEGORY_RULE_QUERY_KEYS,
  CATEGORY_DEPENDENT_QUERY_KEYS,
  invalidateCategoryRuleQueries,
  invalidateCategoryDependentQueries,
};
