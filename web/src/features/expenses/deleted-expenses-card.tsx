import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/shared/ui/feature-data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ExpenseTable } from "./expense-table";
import { ExpenseLoadMoreButton } from "./expense-load-more-button";
import { useDeletedExpensesQuery } from "./expenses-queries";
import type { Expense } from "./expenses-service";

type DeletedExpensesQuery = ReturnType<typeof useDeletedExpensesQuery>;

interface DeletedExpensesCardProps {
  readonly query: DeletedExpensesQuery;
  readonly expenses: readonly Expense[];
  readonly onViewActivity: (expense: Expense) => void;
  readonly showAttribution?: boolean;
  readonly attributionMembers?: readonly { readonly id: string; readonly name: string }[];
}

function DeletedExpensesCard({
  query,
  expenses,
  onViewActivity,
  showAttribution = false,
  attributionMembers,
}: DeletedExpensesCardProps) {
  return (
    <Card
      variant="strong"
      className="-mx-4 mt-5 border-x-0 sm:mx-0 sm:border-x"
    >
      <CardHeader className="border-b">
        <CardTitle>Deleted Expenses</CardTitle>
      </CardHeader>
      {query.isPending && (
        <CardContent>
          <FeatureDataLoading label="Loading deleted Expenses" />
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
          <ExpenseTable
            expenses={expenses}
            emptyMessage="No Expenses have been deleted."
            onViewActivity={onViewActivity}
            showAttribution={showAttribution}
            attributionMembers={attributionMembers}
            ariaLabel="Deleted expenses"
          />
          {query.hasNextPage && (
            <CardContent className="flex justify-center border-t p-4 md:py-3">
              <ExpenseLoadMoreButton
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

export { DeletedExpensesCard };
