import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { isRecord, useApiClient } from "@/shared/api";
import { loadAvailableAccounts, type AccountOption } from "@/shared/account";
import {
  buildFinancialQueryKey,
  captureFinancialMutationScope,
  financialQueryOptions,
  invalidateCategoryDependentQueries,
  queryPolicy,
  useAuthenticatedIdentityId,
  useFinancialQueryScope,
} from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  createExpense,
  deleteExpense,
  getExpenseActivity,
  listDeletedExpenses,
  listExpenses,
  updateExpense,
  type CreateExpenseInput,
  type ExpenseActivity,
  type UpdateExpenseInput,
  type ExpenseListFilters,
} from "./expenses-service";

const EXPENSE_PAGE_SIZE = 20;
const EXPENSE_IDENTITY_KEY_INDEX = 1;
const EXPENSE_SPACE_KEY_INDEX = 2;
const EXPENSE_FILTERS_KEY_INDEX = 4;

function useExpensesQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
  filters?: ExpenseListFilters,
  accounts: readonly AccountOption[] = [],
  statementImportId?: string,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);
  const selectedAccount = accounts.find((option) => option.key === filters?.accountKey);
  const requiresAccount = Boolean(filters?.accountKey && filters.accountKey !== "all" && filters.accountKey !== "manual:cash");
  const { search, fromDate, toDate, categoryId, accountKey } = filters ?? {};
  const queryKey = buildFinancialQueryKey(
    { identityId: scope.identityId, spaceId: scope.spaceId },
    ["expenses"], period,
    { search, fromDate, toDate, categoryId, accountKey, statementImportId },
    selectedAccount?.bank ?? null, selectedAccount?.cardType ?? null,
  );

  return useInfiniteQuery({
    ...financialQueryOptions,
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      listExpenses(
        apiClient,
        {
          period,
          statementImportId,
          pageSize: EXPENSE_PAGE_SIZE,
          cursor: pageParam ?? undefined,
          spaceId,
          description: filters?.search.trim() || undefined,
          fromDate: filters?.fromDate || undefined,
          toDate: filters?.toDate || undefined,
          categoryId: filters?.categoryId && filters.categoryId !== "all" && filters.categoryId !== "uncategorized" ? filters.categoryId : undefined,
          categoryState: filters?.categoryId === "uncategorized" ? "uncategorized" : undefined,
          ...(filters?.accountKey === "manual:cash" ? { source: "manual" as const } : {}),
          ...(requiresAccount && selectedAccount?.bank ? { accountBank: selectedAccount.bank, accountCardType: selectedAccount.cardType ?? "" } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (previousData, previousQuery) =>
      !statementImportId && previousQuery?.queryKey[EXPENSE_IDENTITY_KEY_INDEX] === scope.identityId && previousQuery.queryKey[EXPENSE_SPACE_KEY_INDEX] === scope.spaceId &&
      isRecord(previousQuery.queryKey[EXPENSE_FILTERS_KEY_INDEX]) && !previousQuery.queryKey[EXPENSE_FILTERS_KEY_INDEX].statementImportId
        ? previousData : undefined,
    enabled: enabled && (!requiresAccount || selectedAccount !== undefined),
    staleTime: queryPolicy.activityStaleTime,
    // Returning to an inactive filter or Space starts at the first page.
    gcTime: 0,
  });
}

function useAccountOptionsQuery(spaceId?: string, enabled = true) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);
  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["expense-accounts"]),
    queryFn: ({ signal }) => loadAvailableAccounts(apiClient, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useExpenseActivityQuery(
  expenseId: string | null,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(
      scope,
      ["expense-activity"],
      expenseId,
    ),
    queryFn: ({ signal }) =>
      expenseId === null
        ? Promise.resolve([] as readonly ExpenseActivity[])
        : getExpenseActivity(apiClient, expenseId, spaceId, signal),
    enabled: enabled && expenseId !== null,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useDeletedExpensesQuery(spaceId?: string, enabled = true) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useInfiniteQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["expenses", "deleted"]),
    queryFn: ({ pageParam, signal }) =>
      listDeletedExpenses(
        apiClient,
        {
          pageSize: EXPENSE_PAGE_SIZE,
          cursor: pageParam ?? undefined,
          spaceId,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useCreateExpenseMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: CreateExpenseInput) =>
      createExpense(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useUpdateExpenseMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateExpenseInput) =>
      updateExpense(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useDeleteExpenseMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  type DeleteExpenseMutationInput = {
    readonly expenseId: string;
    readonly spaceId?: string;
    readonly updatedAt?: string;
  };

  return useMutation({
    retry: 0,
    mutationFn: (input: DeleteExpenseMutationInput) =>
      deleteExpense(
        apiClient,
        input.expenseId,
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

export {
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useDeletedExpensesQuery,
  useExpenseActivityQuery,
  useExpensesQuery,
  useAccountOptionsQuery,
  useUpdateExpenseMutation,
};
