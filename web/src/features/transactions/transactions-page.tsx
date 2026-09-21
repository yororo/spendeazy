import { useState } from "react";
import { LoaderCircleIcon, PlusIcon } from "lucide-react";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { ActiveSpaceLabel, MetricCard } from "@/shared/ui";

import { TransactionDeleteDialog } from "./transaction-delete-dialog";
import { TransactionEditorDialog } from "./transaction-editor-dialog";
import { TransactionActivityDialog } from "./transaction-activity-dialog";
import { TransactionTable } from "./transaction-table";
import { useTransactionsQuery } from "./transactions-queries";
import type { Transaction } from "./transactions-service";

interface TransactionsPageProps {
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
}

type TransactionEditorState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly transaction: Transaction };

function TransactionsPage({
  spaceId,
  onSpaceChange,
}: TransactionsPageProps = {}) {
  const { period } = useReportingPeriod();
  const [editorState, setEditorState] =
    useState<TransactionEditorState | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);
  const [transactionToViewActivity, setTransactionToViewActivity] =
    useState<Transaction | null>(null);
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId =
    spaceId ?? spacesQuery.data?.find((space) => space.kind === "personal")?.id;
  const transactionsQuery = useTransactionsQuery(
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
    return <FeatureDataError message="Personal Space is unavailable." onRetry={() => void spacesQuery.refetch()} />;
  }

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
  const isScopeTransitioning =
    transactionsQuery.isFetching && transactionsQuery.isPlaceholderData;
  const controlsDisabled = isScopeTransitioning;
  const editingTransaction =
    editorState?.mode === "edit" ? editorState.transaction : null;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={spaceId} />
          <p className="text-label text-muted-foreground">Transactions</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Your spending
          </h1>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:flex-row md:items-end">
          <ReportingPeriodFilter
            id="transactions-reporting-period"
            disabled={controlsDisabled}
          />
          <Button
            type="button"
            onClick={() => {
              setEditorRevision((revision) => revision + 1);
              setEditorState({ mode: "create" });
            }}
            disabled={controlsDisabled}
          >
            <PlusIcon aria-hidden="true" />
            Record Transaction
          </Button>
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
            onEdit={(transaction) => {
              setEditorRevision((revision) => revision + 1);
              setEditorState({ mode: "edit", transaction });
            }}
            onDelete={setTransactionToDelete}
            onViewActivity={setTransactionToViewActivity}
            showAttribution={spaceId !== undefined}
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
      <TransactionEditorDialog
        key={editorRevision}
        open={editorState !== null}
        transaction={editingTransaction}
        categories={firstPage.categories}
        spaceId={effectiveSpaceId}
        onOpenChange={(open) => {
          if (!open) setEditorState(null);
        }}
        onSaved={() => setEditorState(null)}
        onReload={() => transactionsQuery.refetch()}
      />
      <TransactionDeleteDialog
        open={transactionToDelete !== null}
        transaction={transactionToDelete}
        spaceId={effectiveSpaceId}
        onOpenChange={(open) => {
          if (!open) setTransactionToDelete(null);
        }}
        onDeleted={() => setTransactionToDelete(null)}
        onReload={() => transactionsQuery.refetch()}
      />
      <TransactionActivityDialog
        open={transactionToViewActivity !== null}
        transaction={transactionToViewActivity}
        spaceId={effectiveSpaceId}
        onOpenChange={(open) => {
          if (!open) setTransactionToViewActivity(null);
        }}
      />
    </div>
  );
}

export { TransactionsPage };
