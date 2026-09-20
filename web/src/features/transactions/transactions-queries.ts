import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import { invalidateCategoryDependentQueries, queryPolicy } from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from "./transactions-service";

const TRANSACTION_PAGE_SIZE = 20;

function useTransactionsQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();

  return useInfiniteQuery({
    queryKey: ["transactions", period, spaceId ?? null] as const,
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
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.activityStaleTime,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}

function useCreateTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: CreateTransactionInput) =>
      createTransaction(apiClient, input),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

function useUpdateTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: UpdateTransactionInput) =>
      updateTransaction(apiClient, input),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

function useDeleteTransactionMutation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 0,
    mutationFn: (input: {
      readonly transactionId: string;
      readonly spaceId?: string;
      readonly updatedAt?: string;
    }) =>
      deleteTransaction(
        apiClient,
        input.transactionId,
        input.spaceId,
        input.updatedAt,
      ),
    onSuccess: () => invalidateCategoryDependentQueries(queryClient),
  });
}

export {
  useCreateTransactionMutation,
  useDeleteTransactionMutation,
  useTransactionsQuery,
  useUpdateTransactionMutation,
};
