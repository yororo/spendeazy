import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import {
  invalidateCategoryDependentQueries,
  invalidateCategoryRuleQueries,
  queryPolicy,
} from "@/shared/query";

import {
  commitStatementImport,
  getCategoryCatalogOptions,
  getCategoryRules,
  getRecentImports,
  rememberCategoryRule,
  type CategoryRule,
  type CommitStatementImportOptions,
  type RememberCategoryRuleInput,
  type RememberCategoryRuleResult,
} from "./statement-import-service";
import type { CategorizedStatement } from "./statement-categorizer";

interface RememberCategoryRuleMutationInput {
  readonly input: RememberCategoryRuleInput;
  readonly existingRules: readonly CategoryRule[];
}

interface CommitStatementImportMutationInput
  extends CommitStatementImportOptions {
  readonly file: File;
  readonly statement: CategorizedStatement;
}

function useStatementImportCategoriesQuery() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["statement-import", "categories"] as const,
    queryFn: ({ signal }) => getCategoryCatalogOptions(apiClient, signal),
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useStatementImportRulesQuery() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["statement-import", "rules"] as const,
    queryFn: ({ signal }) => getCategoryRules(apiClient, signal),
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useRecentImportsQuery() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["statement-import", "recent"] as const,
    queryFn: ({ signal }) => getRecentImports(apiClient, signal),
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useRememberCategoryRuleMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<
    RememberCategoryRuleResult,
    Error,
    RememberCategoryRuleMutationInput
  >({
    retry: 0,
    mutationFn: ({ input, existingRules }) =>
      rememberCategoryRule(apiClient, input, existingRules),
    onSuccess: () => invalidateCategoryRuleQueries(queryClient),
  });
}

function useCommitStatementImportMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: ({ file, statement, ...options }: CommitStatementImportMutationInput) =>
      commitStatementImport(apiClient, file, statement, options),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

export {
  useCommitStatementImportMutation,
  useRecentImportsQuery,
  useStatementImportCategoriesQuery,
  useStatementImportRulesQuery,
  useRememberCategoryRuleMutation,
};
