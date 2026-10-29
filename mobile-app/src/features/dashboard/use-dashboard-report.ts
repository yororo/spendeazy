import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";

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
import { isSelectableYear, manilaDate, shiftMonth } from "./dashboard-format";
import { retainCategoryMarkers } from "./dashboard-category-identity";

const EMPTY_CATEGORY_SELECTION: string[] = [];

export function useDashboardReport() {
  const { active } = useSpaces();
  const activeSpaceId = active?.id ?? null;
  const authorized = useAuthorizedClient();
  const categories = useSpaceCategories(activeSpaceId);
  const scopeKey = JSON.stringify([authorized.scope, activeSpaceId]);
  const initialSelection = {
    scopeKey,
    view: "monthly" as DashboardView,
    monthlyEndMonth: null as string | null,
    year: null as string | null,
    chartCategoryIds: EMPTY_CATEGORY_SELECTION,
    categoriesInitialized: false,
    categoryMarkers: {} as Readonly<Record<string, number>>,
  };
  const [selection, setSelection] = useState(initialSelection);
  // Reset before rendering children or issuing a query for a new identity/Space.
  if (selection.scopeKey !== scopeKey) setSelection(initialSelection);
  const { view, monthlyEndMonth, year, chartCategoryIds } =
    selection.scopeKey === scopeKey ? selection : initialSelection;
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
    }),
    [monthlyEndMonth, view, year],
  );
  const queryKey = useMemo(
    () => JSON.stringify([activeSpaceId, query]),
    [activeSpaceId, query],
  );
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

  useEffect(() => {
    let date = manilaDate(new Date());
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      date = manilaDate(new Date());
      refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      const next = manilaDate(new Date());
      if (next === date) return;
      date = next;
      refresh();
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  const toggleChartCategory = useCallback(
    (categoryId: string) => {
      if (!activeSpaceId || !authorized.isCurrent()) return;
      setSelection((current) => {
        const currentIds = current.chartCategoryIds;
        const categoryIds = currentIds.includes(categoryId)
          ? currentIds.filter((id) => id !== categoryId)
          : [...currentIds, categoryId];
        categoryIds.sort(compareIds);
        return {
          ...current,
          chartCategoryIds: categoryIds,
          categoriesInitialized: true,
        };
      });
    },
    [activeSpaceId, authorized],
  );

  const clearChartCategories = useCallback(() => {
    if (!activeSpaceId || !authorized.isCurrent()) return;
    setSelection((current) => ({
      ...current,
      chartCategoryIds: [],
      categoriesInitialized: true,
    }));
  }, [activeSpaceId, authorized]);

  const loading =
    active !== null && state.data === null && state.error === null;
  const report = state.data;
  const categoryMarkers = retainCategoryMarkers(selection.categoryMarkers, [
    ...(report?.categoryExpenses.map((category) => category.categoryId) ?? []),
    ...categories.categories.map((category) => category.id),
  ]);
  if (categoryMarkers !== selection.categoryMarkers && selection.scopeKey === scopeKey) {
    setSelection((current) => ({ ...current, categoryMarkers }));
  }
  // Initialize once per identity/Space from stable report order, including history.
  if (report && !selection.categoriesInitialized && selection.scopeKey === scopeKey) {
    setSelection((current) => ({
      ...current,
      categoriesInitialized: true,
      chartCategoryIds: report.categoryExpenses.slice(0, 3).map((category) => category.categoryId),
    }));
  }
  // Capture the default before displaying it if Yearly was opened while loading.
  if (view === "yearly" && year === null && report) {
    setSelection((current) => ({ ...current, year: report.range.fromDate.slice(0, 4) }));
  }
  const selectView = useCallback(
    (next: DashboardView) => {
      if (!activeSpaceId || !authorized.isCurrent() || next === view) return;
      setSelection((current) => ({
        ...current,
        view: next,
        // Freeze each mode's default before leaving it, including across New Year.
        monthlyEndMonth:
          current.monthlyEndMonth ??
          (report?.range.view === "monthly"
            ? report.monthlyExpenses.at(-1)?.month ?? null
            : null),
        year: current.year ?? report?.range.today.slice(0, 4) ?? null,
      }));
    },
    [activeSpaceId, authorized, report, view],
  );
  const selectYear = useCallback(
    (next: string) => {
      if (
        !activeSpaceId || !authorized.isCurrent() ||
        !report || !isSelectableYear(next, report.range.today)
      ) return;
      setSelection((current) => ({ ...current, year: next }));
    },
    [activeSpaceId, authorized, report],
  );
  const categoryReport = useMemo(
    () =>
      report && chartCategoryIds.length > 0
        ? {
            ...report,
            categoryExpenses: report.categoryExpenses.filter((point) =>
              chartCategoryIds.includes(point.categoryId),
            ),
          }
        : report,
    [chartCategoryIds, report],
  );
  const movePeriod = useCallback(
    (offset: -1 | 1) => {
      if (!activeSpaceId || !authorized.isCurrent()) return;
      if (view === "monthly") {
        const endMonth =
          monthlyEndMonth ?? report?.monthlyExpenses.at(-1)?.month ?? null;
        if (endMonth !== null) {
          const next = shiftMonth(endMonth, offset);
          if (report && next <= report.range.today.slice(0, 7)) {
            setSelection((current) => ({ ...current, monthlyEndMonth: next }));
          }
        }
        return;
      }
    },
    [activeSpaceId, authorized, monthlyEndMonth, report, view],
  );
  return {
    active,
    categories: categories.categories,
    categoriesLoading: categories.loading,
    view,
    report,
    categoryReport,
    error: state.error,
    loading,
    refreshing: state.loading && state.data !== null,
    refresh,
    selectView,
    selectYear,
    scopeKey,
    monthlyEndMonth,
    year,
    movePeriod,
    chartCategoryIds,
    categoryMarkers,
    toggleChartCategory,
    clearChartCategories,
  };
}

function compareIds(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
