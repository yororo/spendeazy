import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  createCategory,
  deleteCategoryBudget,
  getCategoryBudget,
  getCategoriesOverview,
  saveCategoryBudget,
  updateCategory,
  updateCategoryStatus,
  type CreateCategoryInput,
  type SaveCategoryBudgetInput,
  type UpdateCategoryInput,
  type UpdateCategoryStatusInput,
} from "./categories-service";
import {
  getCategoryRuleSnapshot,
  replaceCategoryRuleSnapshot,
  type CategoryRuleInput,
} from "./category-rules-service";

function useCategoriesOverviewQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["categories", "overview"], period),
    queryFn: ({ signal }) =>
      getCategoriesOverview(apiClient, period, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useCategoryRulesQuery(enabled: boolean, spaceId?: string) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["categories", "rules"]),
    queryFn: ({ signal }) =>
      getCategoryRuleSnapshot(apiClient, signal, spaceId),
    enabled,
    staleTime: 0,
  });
}

function useReplaceCategoryRulesMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: {
      readonly categoryId: string;
      readonly rules: readonly CategoryRuleInput[];
      readonly spaceId?: string;
      readonly revision?: string;
    }) =>
      replaceCategoryRuleSnapshot(
        apiClient,
        input.categoryId,
        input.rules,
        input.spaceId,
        input.revision,
      ),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryRuleQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useCreateCategoryMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: ({ input }: { readonly input: CreateCategoryInput }) =>
      createCategory(apiClient, input),
    onMutate: ({ input }) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, variables, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ??
          captureFinancialMutationScope(identityId, variables.input.spaceId),
      ),
  });
}

function useCreateCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: SaveCategoryBudgetInput) =>
      saveCategoryBudget(
        apiClient,
        input.categoryId,
        input.amount,
        input.spaceId,
        input.updatedAt,
      ),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useCategoryBudgetQuery(categoryId: string | null, spaceId?: string) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(
      scope,
      ["categories", "budget"],
      categoryId,
    ),
    queryFn: ({ signal }) =>
      categoryId === null
        ? Promise.resolve(null)
        : getCategoryBudget(apiClient, categoryId, signal, spaceId),
    enabled: categoryId !== null,
    refetchOnMount: "always",
    staleTime: 0,
  });
}

function useUpdateCategoryMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateCategoryInput) =>
      updateCategory(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useUpdateCategoryStatusMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateCategoryStatusInput) =>
      updateCategoryStatus(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useUpdateCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: SaveCategoryBudgetInput) =>
      saveCategoryBudget(
        apiClient,
        input.categoryId,
        input.amount,
        input.spaceId,
        input.updatedAt,
      ),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useDeleteCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (
      input:
        | string
        | {
            readonly categoryId: string;
            readonly spaceId?: string;
            readonly updatedAt?: string;
          },
    ) =>
      typeof input === "string"
        ? deleteCategoryBudget(apiClient, input)
        : deleteCategoryBudget(
            apiClient,
            input.categoryId,
            input.spaceId,
            input.updatedAt,
        ),
    onMutate: (input) =>
      captureFinancialMutationScope(
        identityId,
        typeof input === "string" ? undefined : input.spaceId,
      ),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ??
          captureFinancialMutationScope(
            identityId,
            typeof input === "string" ? undefined : input.spaceId,
          ),
      ),
  });
}

export {
  useCategoryBudgetQuery,
  useCategoryRulesQuery,
  useCategoriesOverviewQuery,
  useCreateCategoryBudgetMutation,
  useCreateCategoryMutation,
  useDeleteCategoryBudgetMutation,
  useUpdateCategoryBudgetMutation,
  useUpdateCategoryMutation,
  useUpdateCategoryStatusMutation,
  useReplaceCategoryRulesMutation,
};
