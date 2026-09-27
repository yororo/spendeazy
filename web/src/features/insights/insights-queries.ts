import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/shared/api";
import {
  buildFinancialQueryKey,
  financialQueryOptions,
  queryPolicy,
  useFinancialQueryScope,
} from "@/shared/query";
import type { ReportingPeriod } from "@/shared/reporting-period";

import {
  getInsights,
  getYearlyInsights,
  type InsightsReportResult,
} from "./insights-service";

type InsightsView = "monthly" | "yearly";

function useInsightsQuery(
  period: ReportingPeriod,
  spaceId?: string,
  enabled = true,
  view: InsightsView = "monthly",
) {
  const apiClient = useApiClient();
  const scope = useFinancialQueryScope(spaceId);

  return useQuery({
    ...financialQueryOptions,
    queryKey: buildFinancialQueryKey(scope, ["insights", view], period),
    queryFn: ({ signal }): Promise<InsightsReportResult> =>
      view === "yearly"
        ? getYearlyInsights(apiClient, period, signal, spaceId)
        : getInsights(apiClient, period, signal, spaceId),
    enabled,
    staleTime: queryPolicy.activityStaleTime,
  });
}

export { useInsightsQuery };
export type { InsightsView };
