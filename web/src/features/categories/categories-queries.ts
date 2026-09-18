import {
  keepPreviousData,
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
  getCategoryRules,
  replaceCategoryRules,
  type CategoryRuleInput,
} from "./category-rules-service";

function useCategoriesOverviewQuery(period: ReportingPeriod) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["categories", "overview", period] as const,
    queryFn: ({ signal }) =>
      getCategoriesOverview(apiClient, period, signal),
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useCategoryRulesQuery(enabled: boolean) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["categories", "rules"] as const,
    queryFn: ({ signal }) => getCategoryRules(apiClient, signal),
    enabled,
    staleTime: 0,
  });
}

function useReplaceCategoryRulesMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: {
      readonly categoryId: string;
      readonly rules: readonly CategoryRuleInput[];
    }) => replaceCategoryRules(apiClient, input.categoryId, input.rules),
    onSuccess: () => invalidateCategoryRuleQueries(queryClient),
  });
}

function useCreateCategoryMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: ({ input }: { readonly input: CreateCategoryInput }) =>
      createCategory(apiClient, input),
    onSuccess: () => {
      void invalidateCategoryDependentQueries(queryClient);
    },
  });
}

function useCreateCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: SaveCategoryBudgetInput) =>
      saveCategoryBudget(
        apiClient,
        input.categoryId,
        input.amount,
      ),
    onSuccess: () => {
      void invalidateCategoryDependentQueries(queryClient);
    },
  });
}

function useCategoryBudgetQuery(categoryId: string | null) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["categories", "budget", categoryId] as const,
    queryFn: ({ signal }) =>
      categoryId === null
        ? Promise.resolve(null)
        : getCategoryBudget(apiClient, categoryId, signal),
    enabled: categoryId !== null,
    refetchOnMount: "always",
    staleTime: 0,
  });
}

function useUpdateCategoryMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateCategoryInput) =>
      updateCategory(apiClient, input),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

function useUpdateCategoryStatusMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateCategoryStatusInput) =>
      updateCategoryStatus(apiClient, input),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

function useUpdateCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: SaveCategoryBudgetInput) =>
      saveCategoryBudget(apiClient, input.categoryId, input.amount),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

function useDeleteCategoryBudgetMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (categoryId: string) =>
      deleteCategoryBudget(apiClient, categoryId),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
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
