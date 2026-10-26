import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { SpaceStatus } from "@/components/space-status";
import { ExpenseBrowse } from "@/features/expenses/browse-view";
import { dashboardExpenseFilterBelongsToSpace } from "@/features/dashboard/dashboard-expense-navigation";
import { useExpenseBrowse } from "@/features/expenses/use-expense-browse";

export default function DashboardExpensesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sourceSpaceId?: string;
    fromDate?: string;
    toDate?: string;
    categoryId?: string;
  }>();
  const controller = useExpenseBrowse();
  const { spaceId, updateSelection } = controller;
  const appliedFilter = useRef<string | null>(null);
  const sourceSpaceId = routeString(params.sourceSpaceId);
  const fromDate = routeString(params.fromDate);
  const toDate = routeString(params.toDate);
  const categoryId = routeString(params.categoryId);

  useEffect(() => {
    if (
      !dashboardExpenseFilterBelongsToSpace(sourceSpaceId, spaceId) ||
      !isCalendarDate(fromDate) ||
      !isCalendarDate(toDate)
    )
      return;
    const filterKey = `${spaceId}:${fromDate}:${toDate}:${categoryId ?? ""}`;
    if (appliedFilter.current === filterKey) return;
    appliedFilter.current = filterKey;
    updateSelection({
      fromDate,
      toDate,
      categoryId: categoryId && isPositiveId(categoryId) ? categoryId : null,
      description: "",
    });
  }, [categoryId, fromDate, sourceSpaceId, spaceId, toDate, updateSelection]);

  return (
    <ExpenseBrowse
      controller={controller}
      spaceStatus={<SpaceStatus />}
      onBackToDashboard={() => router.back()}
      onOpenExpense={(expenseId) =>
        router.push({ pathname: "/expense/[expenseId]", params: { expenseId } })
      }
    />
  );
}

function routeString(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isPositiveId(value: string): boolean {
  return /^[1-9]\d*$/u.test(value);
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
