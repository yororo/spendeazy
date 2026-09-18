import { LoaderCircleIcon } from "lucide-react";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { MetricCard } from "@/shared/ui";

import { TransactionTable } from "./transaction-table";
import { useTransactionsQuery } from "./transactions-queries";

function TransactionsPage() {
  const { period } = useReportingPeriod();
  const transactionsQuery = useTransactionsQuery(period);

  if (transactionsQuery.isPending) {
    return <FeatureDataLoading label="Loading Transactions" />;
  }

  if (transactionsQuery.isError && !transactionsQuery.data) {
    return (
      <FeatureDataError
        message={transactionsQuery.error.message}
        onRetry={() => void transactionsQuery.refetch()}
      />
    );
  }

  const transactionPages = transactionsQuery.data?.pages ?? [];
  const firstPage = transactionPages[0];
  if (!firstPage) return null;

  const transactions = transactionPages.flatMap((page) => page.items);
  const transactionSummary = firstPage.summary;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-label text-muted-foreground">Transactions</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Your spending
          </h1>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <ReportingPeriodFilter id="transactions-reporting-period" />
        </div>
      </header>

      <section
        className="grid grid-cols-2 gap-3"
        aria-label="Transaction summary"
      >
        <MetricCard
          className="min-w-0 [&_.text-metric]:text-xl sm:[&_.text-metric]:text-2xl"
          label="Transactions"
          value={transactionSummary.transactionCount.toString()}
          detail={transactionSummary.period}
        />
        <MetricCard
          className="min-w-0 [&_.text-metric]:text-xl sm:[&_.text-metric]:text-2xl"
          label="Total expense"
          value={formatMoney(transactionSummary.totalExpense)}
          detail={transactionSummary.period}
          emphasized
        />
      </section>

      <Card
        variant="strong"
        className="-mx-4 mt-5 border-x-0 sm:mx-0 sm:border-x"
      >
        <CardHeader className="hidden border-b md:flex">
          <CardTitle>All transactions</CardTitle>
        </CardHeader>
        <div aria-busy={transactionsQuery.isFetching}>
          <TransactionTable
            transactions={transactions}
            emptyMessage="No Transactions were recorded for this Reporting Period."
          />
        </div>
        {transactionsQuery.hasNextPage && (
          <CardContent className="flex justify-center border-t p-4 md:py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              disabled={transactionsQuery.isFetchingNextPage}
              onClick={() => void transactionsQuery.fetchNextPage()}
            >
              {transactionsQuery.isFetchingNextPage && (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              )}
              {transactionsQuery.isFetchingNextPage
                ? "Loading more"
                : "Load more"}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export { TransactionsPage };
