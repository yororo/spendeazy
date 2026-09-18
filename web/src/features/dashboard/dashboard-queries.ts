import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import { queryPolicy } from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getDashboard } from "./dashboard-service";

function useDashboardQuery(period: ReportingPeriod) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["dashboard", period] as const,
    queryFn: ({ signal }) => getDashboard(apiClient, period, signal),
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.activityStaleTime,
  });
}

export { useDashboardQuery };
