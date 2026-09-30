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
  createTransaction,
  deleteTransaction,
  getTransactionActivity,
  listDeletedTransactions,
  listTransactions,
  updateTransaction,
  type CreateTransactionInput,
  type TransactionActivity,
  type UpdateTransactionInput,
  type TransactionListFilters,
} from "./transactions-service";

const TRANSACTION_PAGE_SIZE = 20;
const TRANSACTION_IDENTITY_KEY_INDEX = 4;
const TRANSACTION_SPACE_KEY_INDEX = 5;
const TRANSACTION_FILTERS_KEY_INDEX = 1;

function useTransactionsQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
  filters?: TransactionListFilters,
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
    ["transactions", { search, fromDate, toDate, categoryId, accountKey, statementImportId }, selectedAccount?.bank ?? null, selectedAccount?.cardType ?? null], period,
  );

  return useInfiniteQuery({
    ...financialQueryOptions,
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      listTransactions(
        apiClient,
        {
          period,
          statementImportId,
          pageSize: TRANSACTION_PAGE_SIZE,
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
      !statementImportId && previousQuery?.queryKey[TRANSACTION_IDENTITY_KEY_INDEX] === scope.identityId && previousQuery.queryKey[TRANSACTION_SPACE_KEY_INDEX] === scope.spaceId &&
      isRecord(previousQuery.queryKey[TRANSACTION_FILTERS_KEY_INDEX]) && !previousQuery.queryKey[TRANSACTION_FILTERS_KEY_INDEX].statementImportId
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
    queryKey: buildFinancialQueryKey(scope, ["transaction-accounts"]),
    queryFn: ({ signal }) => loadAvailableAccounts(apiClient, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useTransactionActivityQuery(
  transactionId: string | null,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(
      scope,
      ["transaction-activity"],
      transactionId,
    ),
    queryFn: ({ signal }) =>
      transactionId === null
        ? Promise.resolve([] as readonly TransactionActivity[])
        : getTransactionActivity(apiClient, transactionId, spaceId, signal),
    enabled: enabled && transactionId !== null,
    staleTime: queryPolicy.activityStaleTime,
  });
}

function useDeletedTransactionsQuery(spaceId?: string, enabled = true) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useInfiniteQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["transactions", "deleted"]),
    queryFn: ({ pageParam, signal }) =>
      listDeletedTransactions(
        apiClient,
        {
          pageSize: TRANSACTION_PAGE_SIZE,
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

function useCreateTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: CreateTransactionInput) =>
      createTransaction(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useUpdateTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateTransactionInput) =>
      updateTransaction(apiClient, input),
    onMutate: (input) =>
      captureFinancialMutationScope(identityId, input.spaceId),
    onSuccess: (_data, input, mutationScope) =>
      invalidateCategoryDependentQueries(
        queryClient,
        mutationScope ?? captureFinancialMutationScope(identityId, input.spaceId),
      ),
  });
}

function useDeleteTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const identityId = useAuthenticatedIdentityId();

  type DeleteTransactionMutationInput = {
    readonly transactionId: string;
    readonly spaceId?: string;
    readonly updatedAt?: string;
  };

  return useMutation({
    retry: 0,
    mutationFn: (input: DeleteTransactionMutationInput) =>
      deleteTransaction(
        apiClient,
        input.transactionId,
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
  useCreateTransactionMutation,
  useDeleteTransactionMutation,
  useDeletedTransactionsQuery,
  useTransactionActivityQuery,
  useTransactionsQuery,
  useAccountOptionsQuery,
  useUpdateTransactionMutation,
};
