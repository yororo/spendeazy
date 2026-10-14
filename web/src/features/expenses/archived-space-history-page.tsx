import { useState } from "react";
import { ArchiveIcon, ArrowLeftIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  FeatureDataEmpty,
  FeatureDataError,
  FeatureDataLoading,
} from "@/shared/ui/feature-data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getArchivedSpaces,
  useAccessibleSpacesQuery,
} from "@/shared/api";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import {
  getSpaceIdentityLabel,
  MetricCard,
  SpaceIdentityIcon,
} from "@/shared/ui";

import { ExpenseTable } from "./expense-table";
import { ExpenseActivityDialog } from "./expense-activity-dialog";
import { DeletedExpensesCard } from "./deleted-expenses-card";
import { ExpenseLoadMoreButton } from "./expense-load-more-button";
import {
  useDeletedExpensesQuery,
  useExpensesQuery,
} from "./expenses-queries";
import type { Expense } from "./expenses-service";

function ArchivedSpaceHistoryPage() {
  const [expenseToViewActivity, setExpenseToViewActivity] =
    useState<Expense | null>(null);
  const [searchParams] = useSearchParams();
  const selectedSpaceId = searchParams.get("spaceId") ?? undefined;
  const { period } = useReportingPeriod();
  const spacesQuery = useAccessibleSpacesQuery(true);
  const archivedSpaces = getArchivedSpaces(spacesQuery.data ?? []);
  const selectedSpace = archivedSpaces.find(
    (space) => space.id === selectedSpaceId,
  );
  const expensesQuery = useExpensesQuery(
    period,
    selectedSpace?.id,
    selectedSpace !== undefined,
  );
  const deletedExpensesQuery = useDeletedExpensesQuery(
    selectedSpace?.id,
    selectedSpace !== undefined,
  );

  if (spacesQuery.isPending) {
    return <FeatureDataLoading label="Loading Space history" />;
  }

  if (spacesQuery.isError) {
    return (
      <FeatureDataError
        message={spacesQuery.error.message}
        onRetry={() => void spacesQuery.refetch()}
      />
    );
  }

  if (archivedSpaces.length === 0) {
    return (
      <FeatureDataEmpty
        title="No archived Space history"
        description="Former Shared Spaces will appear here when they become read-only archives."
      />
    );
  }

  if (selectedSpaceId !== undefined && selectedSpace === undefined) {
    return (
      <FeatureDataEmpty
        title="Archived Space unavailable"
        description="This history entry is no longer available to the signed-in User."
      />
    );
  }

  if (!selectedSpace) {
    return <ArchivedSpaceList spaces={archivedSpaces} />;
  }

  if (expensesQuery.isPending) {
    return <FeatureDataLoading label="Loading archived history" />;
  }

  if (expensesQuery.isError && !expensesQuery.data) {
    return (
      <FeatureDataError
        message={expensesQuery.error.message}
        onRetry={() => void expensesQuery.refetch()}
      />
    );
  }

  const firstPage = expensesQuery.data?.pages[0];
  if (!firstPage) return null;

  const expenses = expensesQuery.data.pages.flatMap(
    (page) => page.items,
  );
  const deletedExpenses = deletedExpensesQuery.data?.pages.flatMap(
    (page) => page.items,
  ) ?? [];

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-structure pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-3 -ml-3">
            <Link to="/history">
              <ArrowLeftIcon aria-hidden="true" />
              All archived Spaces
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <SpaceIdentityIcon kind={selectedSpace.kind} />
            <Badge variant="outline">
              <ArchiveIcon aria-hidden="true" />
              Read-only history
            </Badge>
          </div>
          <p className="mt-3 text-label text-muted-foreground">Space history</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Archived Space history
          </h1>
          <p className="mt-2 text-sm font-semibold">
            {getSpaceIdentityLabel(selectedSpace, true)}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            This Shared Space is permanently archived. Its financial history
            remains available to view, but nothing can be created or changed.
          </p>
        </div>
        <ReportingPeriodFilter id="archived-history-reporting-period" />
      </header>

      <section className="grid grid-cols-2 gap-3" aria-label="History summary">
        <MetricCard
          className="min-w-0"
          label="Expenses"
          value={firstPage.summary.expenseCount.toString()}
          detail={firstPage.summary.period}
        />
        <MetricCard
          className="min-w-0"
          label="Total expense"
          value={formatMoney(firstPage.summary.totalExpense)}
          detail={firstPage.summary.period}
          emphasized
        />
      </section>

      <Card
        variant="strong"
        className="-mx-4 mt-5 border-x-0 sm:mx-0 sm:border-x"
      >
        <CardHeader className="border-b">
          <CardTitle>Archived Expenses</CardTitle>
          <CardDescription>
            Read-only records from {getSpaceIdentityLabel(selectedSpace)}.
          </CardDescription>
        </CardHeader>
        <div aria-busy={expensesQuery.isFetching}>
          <ExpenseTable
            expenses={expenses}
            emptyMessage="No Expenses were recorded for this Reporting Period."
            onViewActivity={setExpenseToViewActivity}
            showAttribution
            attributionMembers={selectedSpace.members}
          />
        </div>
        {expensesQuery.hasNextPage && (
          <CardContent className="flex justify-center border-t p-4 md:py-3">
            <ExpenseLoadMoreButton
              isFetchingNextPage={expensesQuery.isFetchingNextPage}
              onLoadMore={() => void expensesQuery.fetchNextPage()}
            />
          </CardContent>
        )}
      </Card>
      <DeletedExpensesCard
        query={deletedExpensesQuery}
        expenses={deletedExpenses}
        onViewActivity={setExpenseToViewActivity}
        showAttribution
        attributionMembers={selectedSpace.members}
      />
      <ExpenseActivityDialog
        open={expenseToViewActivity !== null}
        expense={expenseToViewActivity}
        spaceId={selectedSpace.id}
        attributionMembers={selectedSpace.members}
        onOpenChange={(open) => {
          if (!open) setExpenseToViewActivity(null);
        }}
      />
    </div>
  );
}

function ArchivedSpaceList({
  spaces,
}: {
  readonly spaces: readonly {
    readonly id: string;
    readonly members: readonly { readonly id: string; readonly name: string }[];
    readonly kind: "personal" | "shared";
  }[];
}) {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 border-b border-structure pb-5">
        <p className="text-label text-muted-foreground">Space history</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          Space history
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Former Shared Spaces are kept here as read-only history and never
          appear in the active Space switcher.
        </p>
      </header>

      <section aria-labelledby="archived-spaces-heading">
        <h2
          id="archived-spaces-heading"
          className="mb-3 font-mono text-sm font-bold uppercase"
        >
          Archived Spaces
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {spaces.map((space) => {
            const identity = getSpaceIdentityLabel(space, true);

            return (
              <li key={space.id}>
                <Card variant="strong" className="h-full">
                  <CardContent className="flex h-full flex-col gap-4 p-5">
                    <div className="flex items-start gap-3">
                      <SpaceIdentityIcon kind={space.kind} />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-mono text-base font-bold">
                          {identity}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Former members: {space.members
                            .map((member) => member.name)
                            .join(" and ")}
                        </p>
                      </div>
                      <Badge variant="outline">Read-only history</Badge>
                    </div>
                    <Button
                      asChild
                      variant="secondary"
                      className="mt-auto w-full"
                    >
                      <Link
                        to={`/history?spaceId=${encodeURIComponent(space.id)}`}
                        aria-label={`View history for ${identity}`}
                      >
                        View history
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export { ArchivedSpaceHistoryPage };
