import { useEffect, useRef, useState } from "react";
import { restorePageScroll, type PageScrollPosition } from "@/shared/ui/page-scroll";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/shared/ui/feature-data-state";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveSpaceLabel, MetricCard } from "@/shared/ui";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { cn } from "@/lib/utils";
import { formatMoney, centsToMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
  type ReportingPeriod,
} from "@/shared/reporting-period";

import { DailySpendingChart } from "./daily-spending-chart";
import { CategorySpendingChart } from "./category-spending-chart";
import { MonthlyCategoryRankings } from "./monthly-category-rankings";
import { useInsightsQuery, type InsightsView } from "./insights-queries";
import { MonthlySpendingChart } from "./monthly-spending-chart";
import { SelectedMonthSummary } from "./selected-month-summary";
import { SpendingPatternEvidence } from "./spending-pattern-evidence";

interface InsightsReturnContext {
  readonly scroll: PageScrollPosition;
  readonly focusId: string;
}

interface InsightsPageProps {
  readonly returnContext?: InsightsReturnContext;
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
  readonly onManageBudgets?: () => void;
  readonly onViewTransactions?: (categoryId: string | undefined, period: ReportingPeriod, spaceId?: string) => void;
  readonly onEditBudget?: (categoryId: string, period: ReportingPeriod, spaceId?: string) => void;
}

function InsightsPage({ spaceId, onSpaceChange, onManageBudgets, onViewTransactions, onEditBudget, returnContext }: InsightsPageProps = {}) {
  const [view, setView] = useState<InsightsView>("monthly");
  const { period } = useReportingPeriod();
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId =
    spaceId ?? spacesQuery.data?.find((space) => space.kind === "personal")?.id;
  const insightsQuery = useInsightsQuery(
    period,
    effectiveSpaceId,
    !shouldResolvePersonalSpace || spacesQuery.isSuccess,
    view,
  );
  const ready = insightsQuery.isSuccess;
  const restoredContext = useRef<InsightsReturnContext | undefined>(undefined);
  useEffect(() => {
    if (!returnContext || !ready || restoredContext.current === returnContext) return;
    const frame = requestAnimationFrame(() => {
      restoredContext.current = returnContext;
      const target = document.getElementById(returnContext.focusId);
      let ancestor = target?.parentElement;
      while (ancestor) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      target?.focus({ preventScroll: true });
      restorePageScroll(returnContext.scroll);
    });
    return () => cancelAnimationFrame(frame);
  }, [returnContext, ready]);

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

  if (insightsQuery.isPending) {
    return <FeatureDataLoading label="Loading Insights" />;
  }

  if (insightsQuery.isError && !insightsQuery.data) {
    return (
      <FeatureDataError
        message={insightsQuery.error.message}
        onRetry={() => void insightsQuery.refetch()}
      />
    );
  }

  if (!insightsQuery.data) return null;

  const report = insightsQuery.data;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={effectiveSpaceId} spaces={spacesQuery.data} />
          <p className="text-label text-muted-foreground">Spending insights</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight md:text-3xl">
            Insights
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {view === "monthly"
              ? "See spending across the selected month and its previous 11 months."
              : "See how spending changes across the selected month."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <ReportingPeriodFilter id="insights-reporting-period" />
          </div>
          <div
            role="group"
            aria-label="Insights view"
            className="flex h-10 shrink-0 items-center gap-1 border border-foreground p-1 font-mono text-xs font-semibold tracking-wide"
          >
            <button
              type="button"
              aria-label="Monthly view"
              aria-pressed={view === "monthly"}
              onClick={() => setView("monthly")}
              className={cn(
                "h-8 px-3",
                view === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-label="Daily view"
              aria-pressed={view === "daily"}
              onClick={() => setView("daily")}
              className={cn(
                "h-8 px-3",
                view === "daily"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Daily
            </button>
          </div>
        </div>
      </header>

      {report.view === "monthly" && <SelectedMonthSummary report={report} onViewTransactions={onViewTransactions ? (categoryId, selectedPeriod) => onViewTransactions(categoryId, selectedPeriod, effectiveSpaceId) : undefined} onEditBudget={onEditBudget ? (categoryId, selectedPeriod) => onEditBudget(categoryId, selectedPeriod, effectiveSpaceId) : undefined} onManageBudgets={onManageBudgets} />}
      {report.view === "monthly" && <SpendingPatternEvidence key={report.period} report={report.spendingPatterns} period={report.period} onViewTransactions={onViewTransactions ? (categoryId, selectedPeriod) => onViewTransactions(categoryId, selectedPeriod, effectiveSpaceId) : undefined} />}
      <section
        aria-label={
          report.view === "monthly"
            ? "12-month spending summary"
            : "Daily spending summary"
        }
        aria-busy={insightsQuery.isFetching}
        className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <MetricCard
          label={
            report.view === "monthly"
              ? "12-month total spending"
              : "Total spending"
          }
          value={formatMoney(centsToMoney(report.totalSpendingCents))}
          detail={
            report.view === "monthly"
              ? "All Transactions across the selected month and previous 11 months, including Uncategorized spending"
              : "All Transactions, including Uncategorized spending"
          }
          emphasized
        />
        <MetricCard
          label="Budgeted Spending"
          value={formatMoney(centsToMoney(report.budgetedSpendingCents))}
          detail={
            report.view === "monthly"
              ? "Transactions in Categories with current monthly Budgets across the 12-month window"
              : "Transactions in Categories with a current monthly Budget"
          }
        />
      </section>

      <Card className="mb-5 border-border bg-muted">
        <CardContent className="flex flex-col gap-1 p-4 text-sm">
          <p className="font-semibold">
            Current monthly Budgets: {formatMoney(centsToMoney(report.monthlyBudgetCents))}
          </p>
          {report.view === "monthly" ? (
            <p className="text-muted-foreground">
              Historical comparisons use current monthly Budgets; past Budget
              amounts are not reconstructed. The dashed reference and Over
              Budget markers compare Budgeted Spending only.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Budget comparisons use current monthly Budgets. Daily Budget pace
              is an average for the selected month, not a daily limit.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section
          aria-label={
            report.view === "monthly" ? "Monthly spending" : "Daily spending"
          }
          aria-busy={insightsQuery.isFetching}
        >
          {report.view === "monthly" ? (
            <MonthlySpendingChart report={report} />
          ) : (
            <DailySpendingChart report={report} />
          )}
        </section>
        <section
          aria-label="Category spending trends"
          aria-busy={insightsQuery.isFetching}
        >
          <CategorySpendingChart
            key={effectiveSpaceId ?? "personal"}
            report={report}
          />
        </section>
      </div>
      {report.view === "monthly" ? (
        <MonthlyCategoryRankings report={report} />
      ) : null}
    </div>
  );
}

export { InsightsPage };
export type { InsightsReturnContext };
