import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PlusIcon } from "lucide-react";

import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/shared/ui/feature-data-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccessibleSpacesQuery } from "@/shared/api";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { ActiveSpaceLabel, MetricCard } from "@/shared/ui";

import { ExpenseDeleteDialog } from "./expense-delete-dialog";
import { ExpenseEditorDialog } from "./expense-editor-dialog";
import { ExpenseActivityDialog } from "./expense-activity-dialog";
import { DeletedExpensesCard } from "./deleted-expenses-card";
import { ExpenseLoadMoreButton } from "./expense-load-more-button";
import { ExpenseTable } from "./expense-table";
import {
  useDeletedExpensesQuery,
  useAccountOptionsQuery,
  useExpensesQuery,
} from "./expenses-queries";
import { hasActiveExpenseFilters, type Expense, type ExpenseListFilters } from "./expenses-service";

interface ExpensesPageProps {
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
}

type ExpenseEditorState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly expense: Expense };

function ExpensesPage({
  spaceId,
  onSpaceChange,
}: ExpensesPageProps = {}) {
  const { period } = useReportingPeriod();
  const [searchParams, setSearchParams] = useSearchParams();
  const statementImportId = searchParams.get("statementImportId") ?? undefined;
  const linkedCategoryId = searchParams.get("categoryId") ?? "all";
  const [localFilters, setLocalFilters] = useState<Omit<ExpenseListFilters, "categoryId">>({
    search: "", fromDate: "", toDate: "", accountKey: "all",
  });
  function returnToMonthlyView() {
    const params = new URLSearchParams(searchParams);
    params.delete("statementImportId");
    params.delete("categoryId");
    setLocalFilters({ search: "", fromDate: "", toDate: "", accountKey: "all" });
    setSearchParams(params, { replace: true });
  }
  const statementContext = statementImportId && <section aria-label="Statement filter" className="mb-4 border border-border p-4">
    <p className="font-mono text-sm font-semibold">Statement Import #{statementImportId}</p>
    <p className="mt-1 text-sm">Saved statement expenses across all months.</p>
    <Button className="mt-3" variant="outline" onClick={returnToMonthlyView}>Return to monthly view</Button>
  </section>;
  const filters: ExpenseListFilters = { ...localFilters, categoryId: linkedCategoryId };
  const [editorState, setEditorState] =
    useState<ExpenseEditorState | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [expenseToDelete, setExpenseToDelete] =
    useState<Expense | null>(null);
  const [expenseToViewActivity, setExpenseToViewActivity] =
    useState<Expense | null>(null);
  const shouldResolvePersonalSpace = onSpaceChange !== undefined;
  const spacesQuery = useAccessibleSpacesQuery(shouldResolvePersonalSpace);
  const effectiveSpaceId =
    spaceId ?? spacesQuery.data?.find((space) => space.kind === "personal")?.id;
  const accountOptionsQuery = useAccountOptionsQuery(
    effectiveSpaceId,
    !shouldResolvePersonalSpace || spacesQuery.isSuccess,
  );
  if (accountOptionsQuery.isSuccess && filters.accountKey !== "all" &&
    !accountOptionsQuery.data.some((account) => account.key === filters.accountKey)) {
    setLocalFilters({ ...localFilters, accountKey: "all" });
  }
  const expensesQuery = useExpensesQuery(
    period,
    effectiveSpaceId,
    !shouldResolvePersonalSpace || spacesQuery.isSuccess,
    filters,
    accountOptionsQuery.data,
    statementImportId,
  );
  const deletedExpensesQuery = useDeletedExpensesQuery(
    effectiveSpaceId,
    !shouldResolvePersonalSpace || spacesQuery.isSuccess,
  );

  if (spacesQuery.isError) {
    return (
      <div>{statementContext}<FeatureDataError
        message={spacesQuery.error.message}
        onRetry={() => void spacesQuery.refetch()}
      /></div>
    );
  }

  if (spacesQuery.isSuccess && !effectiveSpaceId) {
    return <div>{statementContext}<FeatureDataError message="Personal Space is unavailable." onRetry={() => void spacesQuery.refetch()} /></div>;
  }

  if (expensesQuery.isPending) {
    if (accountOptionsQuery.isError) {
      return <div>{statementContext}<FeatureDataError message={accountOptionsQuery.error.message} onRetry={() => void accountOptionsQuery.refetch()} /></div>;
    }
    return <div>{statementContext}<FeatureDataLoading label={statementImportId ? "Loading statement Expenses" : "Loading Expenses"} /></div>;
  }

  if (expensesQuery.isError && !expensesQuery.data) {
    return (
      <div>{statementContext}<FeatureDataError
        message={statementImportId ? `Statement Import #${statementImportId}: ${expensesQuery.error.message}` : expensesQuery.error.message}
        onRetry={() => void expensesQuery.refetch()}
      /></div>
    );
  }

  const expensePages = expensesQuery.data?.pages ?? [];
  const firstPage = expensePages[0];
  if (!firstPage) return null;

  const expenses = expensePages.flatMap((page) => page.items);
  const deletedExpensePages = deletedExpensesQuery.data?.pages ?? [];
  const deletedExpenses = deletedExpensePages.flatMap(
    (page) => page.items,
  );
  const expenseSummary = firstPage.summary;
  const hasFilters = Boolean(statementImportId) || hasActiveExpenseFilters(filters);
  const isScopeTransitioning =
    expensesQuery.isFetching && expensesQuery.isPlaceholderData;
  const controlsDisabled = isScopeTransitioning;
  const selectedSpace = spacesQuery.data?.find(
    (space) => space.id === effectiveSpaceId,
  );
  const canManageImportedExpenses =
    selectedSpace?.kind === "shared" &&
    selectedSpace.status === "active" &&
    selectedSpace.accessLevel === "write";
  const editingExpense =
    editorState?.mode === "edit" ? editorState.expense : null;
  const attributionMembers =
    spaceId === undefined
      ? undefined
      : spacesQuery.data?.find((space) => space.id === spaceId)?.members;

  function updateFilters(next: ExpenseListFilters) {
    setLocalFilters({ search: next.search, fromDate: next.fromDate, toDate: next.toDate, accountKey: next.accountKey });
    if (next.categoryId !== linkedCategoryId) {
      const params = new URLSearchParams(searchParams);
      if (next.categoryId === "all") params.delete("categoryId");
      else params.set("categoryId", next.categoryId);
      setSearchParams(params, { replace: true });
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-structure pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <ActiveSpaceLabel spaceId={effectiveSpaceId} spaces={spacesQuery.data} />
          <p className="text-label text-muted-foreground">Expenses</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Your spending
          </h1>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:flex-row md:items-end">
          {!statementImportId && <ReportingPeriodFilter
            id="expenses-reporting-period"
            disabled={controlsDisabled}
          />}
          <Button
            type="button"
            onClick={() => {
              setEditorRevision((revision) => revision + 1);
              setEditorState({ mode: "create" });
            }}
            disabled={controlsDisabled}
          >
            <PlusIcon aria-hidden="true" />
            Record Expense
          </Button>
        </div>
      </header>
      {statementContext}
      {firstPage.statement && <p className="mb-2 break-all text-sm font-semibold">{firstPage.statement.fileName} · {firstPage.statement.account}</p>}
      {statementImportId && !isScopeTransitioning && <p className="mb-4 text-sm text-muted-foreground">
        {expenseSummary.activityFromDate && expenseSummary.activityToDate
          ? `Recorded expense activity matching this view: ${expenseSummary.activityFromDate} – ${expenseSummary.activityToDate}.`
          : "No recorded expense activity matches this view."}
        {" "}Activity dates do not establish complete statement or Space coverage.
      </p>}

      {isScopeTransitioning ? <FeatureDataLoading label="Loading matching Expenses" /> : <section
        className="grid grid-cols-2 gap-3"
        aria-label="Expense summary"
      >
        <MetricCard
          className="min-w-0 [&_.text-metric]:text-xl sm:[&_.text-metric]:text-2xl"
          label={hasFilters ? "Filtered Expenses" : "Expenses"}
          value={expenseSummary.expenseCount.toString()}
          detail={hasFilters ? `Matching filters · ${expenseSummary.period}` : expenseSummary.period}
        />
        <MetricCard
          className="min-w-0 [&_.text-metric]:text-xl sm:[&_.text-metric]:text-2xl"
          label={hasFilters ? "Filtered expense" : "Total expense"}
          value={formatMoney(expenseSummary.totalExpense)}
          detail={hasFilters ? `Matching filters · ${expenseSummary.period}` : expenseSummary.period}
          emphasized
        />
      </section>}

      <Card
        variant="strong"
        className="-mx-4 mt-5 border-x-0 sm:mx-0 sm:border-x"
      >
        <CardHeader className="hidden border-b md:flex">
          <CardTitle>{hasFilters ? "Filtered expenses" : "All expenses"}</CardTitle>
        </CardHeader>
        <div aria-busy={expensesQuery.isFetching}>
          <ExpenseTable
            expenses={isScopeTransitioning ? [] : expenses}
            isLoading={isScopeTransitioning}
            serverFilters={filters}
            onServerFiltersChange={updateFilters}
            categoryOptions={firstPage.categories.map((category) => ({ id: category.id, label: category.name }))}
            accountOptions={accountOptionsQuery.data}
            totalCount={firstPage.totalCount}
            scopeLabel={statementImportId ? "this statement" : undefined}
            emptyMessage={statementImportId ? "No saved expenses match these filters in this statement." : hasFilters ? "No Expenses match these filters in this Reporting Period." : "No Expenses were recorded for this Reporting Period."}
            onEdit={(expense) => {
              setEditorRevision((revision) => revision + 1);
              setEditorState({ mode: "edit", expense });
            }}
            onDelete={setExpenseToDelete}
            onViewActivity={setExpenseToViewActivity}
            allowImportedDeletion={canManageImportedExpenses}
            showAttribution={spaceId !== undefined}
            attributionMembers={attributionMembers}
          />
        </div>
        {accountOptionsQuery.isError && (
          <p className="px-4 py-2 text-sm text-destructive" role="alert">
            Accounts could not be loaded. <button type="button" className="underline" onClick={() => void accountOptionsQuery.refetch()}>Retry</button>
          </p>
        )}
        {expensesQuery.isError && (
          <p className="px-4 py-2 text-sm text-destructive" role="alert">
            Expenses could not be refreshed for these filters. Check the date range or <button type="button" className="underline" onClick={() => void expensesQuery.refetch()}>retry</button>.
          </p>
        )}
        {expensesQuery.hasNextPage && (
          <CardContent className="flex justify-center border-t p-4 md:py-3">
            <ExpenseLoadMoreButton
              isFetchingNextPage={expensesQuery.isFetchingNextPage}
              onLoadMore={() => void expensesQuery.fetchNextPage()}
            />
          </CardContent>
        )}
      </Card>
      {!statementImportId && <DeletedExpensesCard
        query={deletedExpensesQuery}
        expenses={deletedExpenses}
        onViewActivity={setExpenseToViewActivity}
        showAttribution={spaceId !== undefined}
        attributionMembers={attributionMembers}
      />}
      <ExpenseEditorDialog
        key={editorRevision}
        open={editorState !== null}
        expense={editingExpense}
        categories={firstPage.categories}
        spaceId={effectiveSpaceId}
        allowImportedStatementFactEdits={canManageImportedExpenses}
        onOpenChange={(open) => {
          if (!open) setEditorState(null);
        }}
        onSaved={() => setEditorState(null)}
        onReload={() => expensesQuery.refetch()}
      />
      <ExpenseDeleteDialog
        key={expenseToDelete?.id ?? "no-expense"}
        open={expenseToDelete !== null}
        expense={expenseToDelete}
        spaceId={effectiveSpaceId}
        allowImportedDeletion={canManageImportedExpenses}
        onOpenChange={(open) => {
          if (!open) setExpenseToDelete(null);
        }}
        onDeleted={() => setExpenseToDelete(null)}
        onReload={() => expensesQuery.refetch()}
      />
      <ExpenseActivityDialog
        open={expenseToViewActivity !== null}
        expense={expenseToViewActivity}
        spaceId={effectiveSpaceId}
        attributionMembers={attributionMembers}
        onOpenChange={(open) => {
          if (!open) setExpenseToViewActivity(null);
        }}
      />
    </div>
  );
}

export { ExpensesPage };
