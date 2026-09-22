import type { QueryClient } from "@tanstack/react-query";

import {
  buildFinancialQueryKey,
  type FinancialQueryScope,
} from "./financial-query-scope";

const CATEGORY_DEPENDENT_QUERY_KEYS = [
  ["categories", "overview"],
  ["categories", "rules"],
  ["categories", "budget"],
  ["dashboard"],
  ["transactions"],
  ["transactions", "deleted"],
  ["transaction-activity"],
  ["statement-import", "categories"],
  ["statement-import", "rules"],
  ["statement-import", "recent"],
] as const;
const CATEGORY_RULE_QUERY_KEYS = [
  ["categories", "rules"],
  ["statement-import", "rules"],
] as const;

async function invalidateCategoryDependentQueries(
  queryClient: QueryClient,
  scope: FinancialQueryScope,
) {
  await Promise.all(
    CATEGORY_DEPENDENT_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey: buildFinancialQueryKey(scope, queryKey),
      }),
    ),
  );
}

async function invalidateCategoryRuleQueries(
  queryClient: QueryClient,
  scope: FinancialQueryScope,
) {
  await Promise.all(
    CATEGORY_RULE_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey: buildFinancialQueryKey(scope, queryKey),
      }),
    ),
  );
}

export {
  CATEGORY_RULE_QUERY_KEYS,
  CATEGORY_DEPENDENT_QUERY_KEYS,
  invalidateCategoryRuleQueries,
  invalidateCategoryDependentQueries,
};
