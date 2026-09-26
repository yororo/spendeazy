import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import {
  buildFinancialQueryKey,
  financialQueryOptions,
  queryPolicy,
  useFinancialQueryScope,
} from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import { getInsights } from "./insights-service";

function useInsightsQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["insights", "monthly"], period),
    queryFn: ({ signal }) => getInsights(apiClient, period, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

export { useInsightsQuery };
