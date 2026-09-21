import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import {
  buildFinancialQueryKey,
  financialQueryOptions,
  queryPolicy,
  useFinancialQueryScope,
} from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getDashboard } from "./dashboard-service";

function useDashboardQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["dashboard"], period),
    queryFn: ({ signal }) => getDashboard(apiClient, period, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

export { useDashboardQuery };
