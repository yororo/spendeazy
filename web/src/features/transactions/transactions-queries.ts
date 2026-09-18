import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import { queryPolicy } from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { listTransactions } from "./transactions-service";

const TRANSACTION_PAGE_SIZE = 20;

function useTransactionsQuery(period: ReportingPeriod) {
  const apiClient = useApiClient();

  return useInfiniteQuery({
    queryKey: ["transactions", period] as const,
    queryFn: ({ pageParam, signal }) =>
      listTransactions(
        apiClient,
        {
          period,
          pageSize: TRANSACTION_PAGE_SIZE,
          cursor: pageParam ?? undefined,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.activityStaleTime,
  });
}

export { useTransactionsQuery };
