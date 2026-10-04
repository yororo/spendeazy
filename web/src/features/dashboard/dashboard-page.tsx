import { DownloadIcon } from "lucide-react";
import { Link } from "react-router-dom";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/shared/ui/feature-data-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { formatMoney, moneyToCents } from "@/shared/money";
import { budgetStatusLabels, getBudgetStatus } from "@/shared/budget";
import { CategoryBadge } from "@/shared/category";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { ActiveSpaceLabel, MetricCard } from "@/shared/ui";

import { CategoryAttentionHelp } from "./category-attention-help";
import { CategoryBreakdown } from "./category-breakdown";
import { useDashboardQuery } from "./dashboard-queries";
import { RecentTransactions } from "./recent-transactions";
import { SpendingChart } from "./spending-chart";

interface DashboardPageProps {
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
  readonly onManageBudgets?: () => void;
}

function DashboardPage({
  spaceId,
  onSpaceChange,
  onManageBudgets,
}: DashboardPageProps = {}) {
  const { period } = useReportingPeriod();
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId =
    spaceId ?? spacesQuery.data?.find((space) => space.kind === "personal")?.id;
  const dashboardQuery = useDashboardQuery(
    period,
    effectiveSpaceId,
    !shouldResolvePersonalSpace || spacesQuery.isSuccess,
  );

  if (spacesQuery.isError) {
    return (
      <FeatureDataError
        message={spacesQuery.error.message}
        onRetry={() => void spacesQuery.refetch()}
      />
    );
  }

  if (spacesQuery.isSuccess && !effectiveSpaceId) {
    return (
      <FeatureDataError
        message="Personal Space is unavailable."
        onRetry={() => void spacesQuery.refetch()}
      />
    );
  }

  if (dashboardQuery.isPending) {
    return <FeatureDataLoading label="Loading Dashboard" />;
  }

  if (dashboardQuery.isError && !dashboardQuery.data) {
    return (
      <FeatureDataError
        message={dashboardQuery.error.message}
        onRetry={() => void dashboardQuery.refetch()}
      />
    );
  }

  if (!dashboardQuery.data) return null;

  const {
    summary: dashboardSummary,
    categorySpending,
    recentTransactions,
    spendingPoints,
    budgetAlerts,
  } = dashboardQuery.data;
  const visibleBudgetAlerts = dashboardQuery.isPlaceholderData
    ? []
    : budgetAlerts;

  return (
    <div
      id="dashboard"
      className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7"
    >
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <ActiveSpaceLabel
            spaceId={effectiveSpaceId}
            spaces={spacesQuery.data}
          />
          <p className="text-label text-muted-foreground">
            Dashboard / Monthly expenses
          </p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight md:text-3xl">
            Your spending at a glance
          </h1>
          <p className="mt-2 hidden max-w-2xl text-sm text-muted-foreground md:block">
            A clear view of the selected period&apos;s activity, categories, and
            budget usage.
          </p>
        </div>
        <div className="flex items-center gap-2 md:flex-wrap">
          <div className="min-w-0 flex-1 md:flex-none">
            <ReportingPeriodFilter id="dashboard-reporting-period" />
          </div>
          <Button
            asChild
            variant="secondary"
            className="size-11 shrink-0 p-0 md:h-10 md:w-auto md:px-4"
          >
            <Link to="/imports">
              <DownloadIcon aria-hidden="true" />
              <span className="sr-only md:not-sr-only">Import statement</span>
            </Link>
          </Button>
        </div>
      </header>

      <section
        aria-labelledby="summary-heading"
        aria-busy={dashboardQuery.isFetching}
      >
        <h2 id="summary-heading" className="sr-only">
          Monthly summary
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MetricCard
            label="Total spend"
            value={formatMoney(dashboardSummary.totalSpend)}
            detail={`${dashboardSummary.recordedDayCount} days recorded`}
            emphasized
            className="min-w-0"
          />
          <MetricCard
            label="Spending vs Budget"
            emphasized
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={
              dashboardSummary.budgetLimit > 0
                ? `${dashboardSummary.budgetUsed}%`
                : "No Budgets"
            }
            detail={
              dashboardSummary.budgetLimit > 0 ? (
                <span className="flex flex-col items-start gap-1">
                  <span className="inline-flex rounded-md border border-primary-foreground/40 bg-background px-2 py-1 font-medium text-foreground">
                    {
                      budgetStatusLabels[
                        getBudgetStatus(
                          moneyToCents(dashboardSummary.budgetedSpend),
                          moneyToCents(dashboardSummary.budgetLimit),
                        )
                      ]
                    }
                  </span>
                  <span>
                    {formatMoney(dashboardSummary.budgetedSpend)} of{" "}
                    {formatMoney(dashboardSummary.budgetLimit)}
                  </span>
                </span>
              ) : (
                "Add a monthly Budget to track progress"
              )
            }
            progress={
              dashboardSummary.budgetLimit > 0
                ? dashboardSummary.budgetUsed
                : undefined
            }
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Transactions"
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={dashboardSummary.transactionCount.toString()}
            detail={`Across ${dashboardSummary.accountCount} accounts`}
          />
          <MetricCard
            label="Top category"
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={dashboardSummary.topCategory}
            detail={`${formatMoney(dashboardSummary.topCategoryAmount)} in selected period`}
          />
          <MetricCard
            label="Average / day"
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={formatMoney(dashboardSummary.averagePerDay)}
            detail="Across all categories"
          />
          <MetricCard
            label="Unbudgeted spending"
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={formatMoney(dashboardSummary.unbudgetedSpend)}
            detail="Without monthly limits, including Uncategorized"
          />
        </div>
      </section>

      <section className="mt-5" aria-labelledby="budget-attention-heading">
        <Card variant="strong">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="relative flex items-center">
              <CardTitle id="budget-attention-heading">
                Category attention
              </CardTitle>
              <CategoryAttentionHelp />
            </div>
            {onManageBudgets && visibleBudgetAlerts.length > 0 && (
              <Button
                variant="ghost"
                className="min-h-11 shrink-0"
                onClick={onManageBudgets}
              >
                Manage Budgets
              </Button>
            )}
          </CardHeader>
          <CardContent className="border-t p-0">
            {visibleBudgetAlerts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {dashboardQuery.isPlaceholderData
                  ? "Updating Category attention…"
                  : "Looking good! No Categories need attention yet."}
              </p>
            ) : (
              <ul className="divide-y">
                {visibleBudgetAlerts.map((alert) => {
                  const category = categorySpending.find(
                    (item) => item.id === alert.categoryId,
                  );
                  return (
                  <li key={alert.categoryId}>
                    <Link
                      to={`/transactions?categoryId=${encodeURIComponent(alert.categoryId)}`}
                      className="focus-ledger flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                    >
                      {category ? (
                        <CategoryBadge category={category.category} color={category.color} className="min-w-0 whitespace-normal wrap-anywhere">
                          {alert.label}
                        </CategoryBadge>
                      ) : (
                        <span className="min-w-0 font-medium">{alert.label}</span>
                      )}
                      <span className="flex flex-col items-end gap-1 text-right font-mono text-sm tabular-nums">
                        {alert.status !== "unbudgeted" && (
                          <Badge variant="outline" className={alert.status === "over" ? "border-destructive bg-destructive/10 text-destructive normal-case" : "normal-case"}>
                            {budgetStatusLabels[alert.status]}
                          </Badge>
                        )}
                        <span>
                          {alert.status === "over"
                            ? `${formatMoney(Math.abs(alert.remaining ?? 0))} over`
                            : alert.status === "limit"
                              ? `${formatMoney(0)} remaining`
                              : alert.status === "near"
                                ? `${alert.usage}% used · ${formatMoney(alert.remaining ?? 0)} left`
                                : `${formatMoney(alert.spent)} · No Budget`}
                        </span>
                      </span>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section
        aria-label="Spending analysis"
        className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3"
      >
        <div className="xl:col-span-2">
          <SpendingChart
            key={`${effectiveSpaceId ?? "personal"}-${period}`}
            points={spendingPoints}
            title="Daily spending"
            currentLabel={dashboardSummary.period}
            summary="Daily expenses recorded for the selected month."
          />
        </div>
        <CategoryBreakdown
          categories={dashboardQuery.isPlaceholderData ? [] : categorySpending}
        />
      </section>

      <section
        id="recent-transactions"
        className="mt-5"
        aria-labelledby="transactions-heading"
      >
        <Card variant="strong">
          <CardHeader className="flex-row items-end justify-between gap-4">
            <div>
              <CardTitle id="transactions-heading">
                Recent transactions
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground md:hidden">
                {recentTransactions.length} recent transactions
              </p>
              <p className="mt-1 hidden text-xs text-muted-foreground md:block">
                Latest activity across connected accounts
              </p>
            </div>
            <Button asChild variant="ghost" className="min-h-11 shrink-0">
              <Link to="/transactions" aria-label="View all transactions">
                View all
              </Link>
            </Button>
          </CardHeader>
          <RecentTransactions
            transactions={recentTransactions}
            showAttribution={spaceId !== undefined}
          />
        </Card>
      </section>
    </div>
  );
}

export { DashboardPage };
