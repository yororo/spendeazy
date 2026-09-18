import { DownloadIcon } from "lucide-react";
import { Link } from "react-router-dom";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { MetricCard } from "@/shared/ui";

import { CategoryBreakdown } from "./category-breakdown";
import { useDashboardQuery } from "./dashboard-queries";
import { RecentTransactions } from "./recent-transactions";
import { SpendingChart } from "./spending-chart";

function DashboardPage() {
  const { period } = useReportingPeriod();
  const dashboardQuery = useDashboardQuery(period);

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
  } = dashboardQuery.data;

  return (
    <div
      id="dashboard"
      className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7"
    >
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
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
          <Button asChild variant="secondary" className="size-11 shrink-0 p-0 md:h-10 md:w-auto md:px-4">
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <MetricCard
            label="Total spend"
            value={formatMoney(dashboardSummary.totalSpend)}
            detail={`${dashboardSummary.recordedDayCount} days recorded`}
            emphasized
            className="col-span-2 min-w-0 md:col-span-1"
          />
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
            label="Budget used"
            className="min-w-0 [&_.text-metric]:text-xl md:[&_.text-metric]:text-2xl"
            value={`${dashboardSummary.budgetUsed}%`}
            detail={`${formatMoney(dashboardSummary.budgetRemaining)} remaining`}
            progress={dashboardSummary.budgetUsed}
          />
        </div>
      </section>

      <section
        aria-label="Spending analysis"
        className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3"
      >
        <div className="xl:col-span-2">
          <SpendingChart
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
            <Button asChild variant="ghost" className="min-h-11 shrink-0 md:hidden">
              <Link to="/transactions" aria-label="View all transactions">View all</Link>
            </Button>
          </CardHeader>
          <RecentTransactions transactions={recentTransactions} />
        </Card>
      </section>
    </div>
  );
}

export { DashboardPage };
