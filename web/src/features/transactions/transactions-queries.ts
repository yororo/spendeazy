import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
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
  listTransactions,
  updateTransaction,
  type CreateTransactionInput,
  type TransactionActivity,
  type UpdateTransactionInput,
} from "./transactions-service";

const TRANSACTION_PAGE_SIZE = 20;

function useTransactionsQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useInfiniteQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["transactions"], period),
    queryFn: ({ pageParam, signal }) =>
      listTransactions(
        apiClient,
        {
          period,
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
  useTransactionActivityQuery,
  useTransactionsQuery,
  useUpdateTransactionMutation,
};
