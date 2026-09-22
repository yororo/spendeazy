import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { TransactionTable } from "./transaction-table";
import { TransactionLoadMoreButton } from "./transaction-load-more-button";
import { useDeletedTransactionsQuery } from "./transactions-queries";
import type { Transaction } from "./transactions-service";

type DeletedTransactionsQuery = ReturnType<typeof useDeletedTransactionsQuery>;

interface DeletedTransactionsCardProps {
  readonly query: DeletedTransactionsQuery;
  readonly transactions: readonly Transaction[];
  readonly onViewActivity: (transaction: Transaction) => void;
  readonly showAttribution?: boolean;
  readonly attributionMembers?: readonly { readonly id: string; readonly name: string }[];
}

function DeletedTransactionsCard({
  query,
  transactions,
  onViewActivity,
  showAttribution = false,
  attributionMembers,
}: DeletedTransactionsCardProps) {
  return (
    <Card
      variant="strong"
      className="-mx-4 mt-5 border-x-0 sm:mx-0 sm:border-x"
    >
      <CardHeader className="border-b">
        <CardTitle>Deleted Transactions</CardTitle>
      </CardHeader>
      {query.isPending && (
        <CardContent>
          <FeatureDataLoading label="Loading deleted Transactions" />
        </CardContent>
      )}
      {query.isError && (
        <CardContent>
          <FeatureDataError
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        </CardContent>
      )}
      {query.isSuccess && (
        <div aria-busy={query.isFetching}>
          <TransactionTable
            transactions={transactions}
            emptyMessage="No Transactions have been deleted."
            onViewActivity={onViewActivity}
            showAttribution={showAttribution}
            attributionMembers={attributionMembers}
            ariaLabel="Deleted transactions"
          />
          {query.hasNextPage && (
            <CardContent className="flex justify-center border-t p-4 md:py-3">
              <TransactionLoadMoreButton
                isFetchingNextPage={query.isFetchingNextPage}
                onLoadMore={() => void query.fetchNextPage()}
              />
            </CardContent>
          )}
        </div>
      )}
    </Card>
  );
}

export { DeletedTransactionsCard };
