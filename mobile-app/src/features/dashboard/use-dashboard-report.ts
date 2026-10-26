import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createDashboardReportApiClient,
  type DashboardReport,
  type DashboardView,
} from "@/api/dashboard-report-api-client";
import { useAuthorizedClient } from "@/application/authorized-client";
import { createSessionResource } from "@/application/session-resource";
import { session } from "@/application/session-runtime";
import { useSpaces } from "@/application/spaces/provider";
import { useSpaceCategories } from "@/features/expenses/use-space-categories";
import { shiftMonth } from "./dashboard-format";

const EMPTY_CATEGORY_SELECTION: string[] = [];

export function useDashboardReport() {
  const { active } = useSpaces();
  const activeSpaceId = active?.id ?? null;
  const authorized = useAuthorizedClient();
  const categories = useSpaceCategories(activeSpaceId);
  const [view, setView] = useState<DashboardView>("monthly");
  const [monthlyEndMonth, setMonthlyEndMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [chartFilter, setChartFilter] = useState<{
    spaceId: string | null;
    categoryIds: string[];
  }>({ spaceId: null, categoryIds: [] });
  const chartCategoryIds = useMemo(
    () =>
      chartFilter.spaceId === activeSpaceId
        ? chartFilter.categoryIds
        : EMPTY_CATEGORY_SELECTION,
    [activeSpaceId, chartFilter],
  );
  const query = useMemo(
    () => ({
      view,
      ...(view === "monthly"
        ? monthlyEndMonth === null
          ? {}
          : { endMonth: monthlyEndMonth }
        : year === null
          ? {}
          : { year }),
      chartCategoryIds,
    }),
    [chartCategoryIds, monthlyEndMonth, view, year],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const resource = useMemo(
    () =>
      createSessionResource<DashboardReport>(
        session,
        authorized.scope,
        queryKey,
      ),
    [authorized.scope, queryKey],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.snapshot,
    resource.snapshot,
  );
  const api = useMemo(
    () => createDashboardReportApiClient(authorized),
    [authorized],
  );

  useEffect(() => {
    if (!activeSpaceId || !authorized.isCurrent()) return;
    void resource.load(() => api.getDashboardReport(activeSpaceId, query));
    return resource.cancel;
  }, [activeSpaceId, api, authorized, query, resource]);

  const refresh = useCallback(() => {
    if (!activeSpaceId || !authorized.isCurrent()) return;
    void resource.load(() => api.getDashboardReport(activeSpaceId, query));
  }, [activeSpaceId, api, authorized, query, resource]);

  const toggleChartCategory = useCallback(
    (categoryId: string) => {
      if (!activeSpaceId || !authorized.isCurrent()) return;
      setChartFilter((current) => {
        const currentIds =
          current.spaceId === activeSpaceId ? current.categoryIds : [];
        const categoryIds = currentIds.includes(categoryId)
          ? currentIds.filter((id) => id !== categoryId)
          : [...currentIds, categoryId];
        categoryIds.sort(compareIds);
        return { spaceId: activeSpaceId, categoryIds };
      });
    },
    [activeSpaceId, authorized],
  );

  const clearChartCategories = useCallback(() => {
    if (!activeSpaceId || !authorized.isCurrent()) return;
    setChartFilter({ spaceId: activeSpaceId, categoryIds: [] });
  }, [activeSpaceId, authorized]);

  const selectView = useCallback((next: DashboardView) => {
    setView(next);
  }, []);

  const loading =
    active !== null && state.data === null && state.error === null;
  const report = state.data;
  const movePeriod = useCallback(
    (offset: -1 | 1) => {
      if (view === "monthly") {
        const endMonth =
          monthlyEndMonth ?? report?.monthlyExpenses.at(-1)?.month ?? null;
        if (endMonth !== null) {
          setMonthlyEndMonth(shiftMonth(endMonth, offset));
        }
        return;
      }
      const selectedYear = year ?? report?.range.today.slice(0, 4) ?? null;
      if (selectedYear !== null) {
        setYear(String(Number(selectedYear) + offset));
      }
    },
    [monthlyEndMonth, report, view, year],
  );
  return {
    active,
    categories: categories.categories,
    categoriesLoading: categories.loading,
    view,
    report,
    error: state.error,
    loading,
    refreshing: state.loading && state.data !== null,
    refresh,
    selectView,
    monthlyEndMonth,
    year,
    movePeriod,
    chartCategoryIds,
    toggleChartCategory,
    clearChartCategories,
  };
}

function compareIds(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
