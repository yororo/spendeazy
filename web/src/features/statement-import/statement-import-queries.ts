import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  readonly spaceId?: string;
}

interface CommitStatementImportMutationInput extends CommitStatementImportOptions {
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

function useStatementImportRulesQuery(spaceId?: string) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["statement-import", "rules", spaceId ?? null] as const,
    queryFn: ({ signal }) => getCategoryRules(apiClient, signal, spaceId),
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
    mutationFn: ({ input, existingRules, spaceId }) =>
      rememberCategoryRule(apiClient, input, existingRules, undefined, spaceId),
    onSuccess: () => invalidateCategoryRuleQueries(queryClient),
  });
}

function useCommitStatementImportMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: ({
      file,
      statement,
      ...options
    }: CommitStatementImportMutationInput) =>
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
