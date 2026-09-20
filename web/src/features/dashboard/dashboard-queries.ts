import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import { queryPolicy } from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getDashboard } from "./dashboard-service";

function useDashboardQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["dashboard", period, spaceId ?? null] as const,
    queryFn: ({ signal }) => getDashboard(apiClient, period, signal, spaceId),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.activityStaleTime,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}

export { useDashboardQuery };
