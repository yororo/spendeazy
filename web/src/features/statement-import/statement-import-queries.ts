import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import {
  buildFinancialQueryKey,
  captureFinancialMutationScope,
  financialQueryOptions,
  invalidateCategoryDependentQueries,
  invalidateCategoryRuleQueries,
  queryPolicy,
  useAuthenticatedIdentityId,
  useFinancialQueryScope,
} from "@/shared/query";
import type { FinancialMutationScope } from "@/shared/query";

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

function useStatementImportCategoriesQuery(
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["statement-import", "categories"]),
    queryFn: ({ signal }) =>
      getCategoryCatalogOptions(apiClient, signal, spaceId),
    enabled,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useStatementImportRulesQuery(spaceId?: string, enabled = true) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["statement-import", "rules"]),
    queryFn: ({ signal }) => getCategoryRules(apiClient, signal, spaceId),
    enabled,
    staleTime: queryPolicy.categoryCatalogStaleTime,
  });
}

function useRecentImportsQuery(spaceId?: string, enabled = true) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["statement-import", "recent"]),
    queryFn: ({ signal }) => getRecentImports(apiClient, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useRememberCategoryRuleMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation<
    RememberCategoryRuleResult,
    Error,
    RememberCategoryRuleMutationInput,
    FinancialMutationScope
  >({
    retry: 0,
    mutationFn: ({ input, existingRules, spaceId }) =>
      rememberCategoryRule(apiClient, input, existingRules, undefined, spaceId),
    onMutate: ({ spaceId }) =>
      captureFinancialMutationScope(identityId, spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryRuleQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useCommitStatementImportMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: ({
      file,
      statement,
      ...options
    }: CommitStatementImportMutationInput) =>
      commitStatementImport(apiClient, file, statement, options),
    onMutate: ({ spaceId }) =>
      captureFinancialMutationScope(identityId, spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

export {
  useCommitStatementImportMutation,
  useRecentImportsQuery,
  useStatementImportCategoriesQuery,
  useStatementImportRulesQuery,
  useRememberCategoryRuleMutation,
};
