import { useRef, useState } from "react";
import {
  ArchiveIcon,
  AlertCircleIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  FeatureDataError,
  FeatureDataLoading,
} from "@/components/app/feature-data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryBadge } from "@/shared/category";
import { formatMoney } from "@/shared/money";
import {
  ReportingPeriodFilter,
  useReportingPeriod,
} from "@/shared/reporting-period";
import { MetricCard } from "@/shared/ui";

import { filterCategoriesByName } from "./categories-filter";
import {
  useAccessibleSpacesQuery,
  useCategoriesOverviewQuery,
  useUpdateCategoryStatusMutation,
} from "./categories-queries";
import { CreateCategoryDialog } from "./create-category-dialog";
import { EditCategoryRow } from "./edit-category-row";
import { MatchingRulesDialog } from "./matching-rules-dialog";
import { MobileCategoryCard } from "./mobile-category-card";
import type { CategoryOverviewItem } from "./categories-service";

interface CategoryStatusDialogState {
  readonly category: CategoryOverviewItem;
}

interface CategoryStatusFailureAlertProps {
  readonly className?: string;
  readonly message: string;
}

interface CategoriesPageProps {
  readonly spaceId?: string;
  readonly onSpaceChange?: (spaceId?: string) => void;
}

function getCategoriesEmptyMessage(
  categories: readonly CategoryOverviewItem[],
  matchingCategories: readonly CategoryOverviewItem[],
  search: string,
  showInactive: boolean,
) {
  if (search.trim()) {
    if (!showInactive && matchingCategories.some((category) => !category.isActive)) {
      return "No active Categories match your search. Show inactive Categories to view them.";
    }

    return "No Categories match your search.";
  }

  if (!showInactive && categories.length > 0) {
    return "All Categories are inactive. Show inactive Categories to view them.";
  }

  return "No Categories are configured.";
}

function CategoryStatusFailureAlert({
  className,
  message,
}: CategoryStatusFailureAlertProps) {
  return (
    <Alert className={className} variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>Category status could not be saved.</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function CategoriesPage({ spaceId, onSpaceChange }: CategoriesPageProps = {}) {
  const { period } = useReportingPeriod();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [mobileEditingCategoryId, setMobileEditingCategoryId] =
    useState<string | null>(null);
  const [statusDialog, setStatusDialog] =
    useState<CategoryStatusDialogState | null>(null);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusFallbackRef = useRef(false);
  const categoriesQuery = useCategoriesOverviewQuery(period, spaceId);
  const spacesQuery = useAccessibleSpacesQuery(
    onSpaceChange !== undefined && spacePickerOpen,
  );
  const statusMutation = useUpdateCategoryStatusMutation();

  if (categoriesQuery.isPending) {
    return <FeatureDataLoading label="Loading Budget overview" />;
  }

  if (categoriesQuery.isError && !categoriesQuery.data) {
    return (
      <FeatureDataError
        message={categoriesQuery.error.message}
        onRetry={() => void categoriesQuery.refetch()}
      />
    );
  }

  if (!categoriesQuery.data) return null;

  const {
    categories,
    periodLabel,
    totalBudget,
    totalSpent,
    totalRemaining,
  } = categoriesQuery.data;
  const matchingCategories = filterCategoriesByName(categories, search);
  const visibleCategories = matchingCategories.filter(
    (category) => showInactive || category.isActive,
  );
  const visibleCategoryIds = new Set(
    visibleCategories.map((category) => category.id),
  );
  const categoriesToRender = categories.filter(
    (category) =>
      category.id === editingCategoryId || visibleCategoryIds.has(category.id),
  );
  const emptyMessage = getCategoriesEmptyMessage(
    categories,
    matchingCategories,
    search,
    showInactive,
  );
  const isEditing =
    editingCategoryId !== null || mobileEditingCategoryId !== null;
  const activeCategoryCount = categories.filter(
    (category) => category.isActive,
  ).length;
  const budgetedCategoryCount = categories.filter(
    (category) => category.budget !== null,
  ).length;
  const isStatusMutationPending = statusMutation.isPending;
  const isScopeTransitioning =
    categoriesQuery.isFetching && categoriesQuery.isPlaceholderData;
  const filtersDisabled =
    isEditing || isStatusMutationPending || isScopeTransitioning;

  function focusVisibilityControl() {
    window.setTimeout(() => {
      const visibilityControl = document.getElementById(
        "categories-show-inactive",
      );
      visibilityControl?.focus();
    }, 10);
  }

  function handleStatusDialogCloseAutoFocus(event: Event) {
    event.preventDefault();
    if (focusFallbackRef.current) {
      focusVisibilityControl();
      focusFallbackRef.current = false;
      return;
    }

    const trigger = statusTriggerRef.current;
    if (trigger && document.body.contains(trigger)) {
      trigger.focus();
      return;
    }

    focusVisibilityControl();
  }

  function openDeactivation(
    category: CategoryOverviewItem,
    trigger: HTMLButtonElement,
  ) {
    statusMutation.reset();
    statusTriggerRef.current = trigger;
    focusFallbackRef.current = false;
    setStatusDialog({ category });
  }

  function closeStatusDialog() {
    if (statusMutation.isPending) return;

    setStatusDialog(null);
    statusMutation.reset();
    focusFallbackRef.current = false;
  }

  async function saveCategoryStatus(
    categoryId: string,
    isActive: boolean,
  ): Promise<boolean> {
    if (statusMutation.isPending) return false;

    try {
      await statusMutation.mutateAsync({
        categoryId,
        isActive,
        spaceId,
        updatedAt: statusDialog?.category.id === categoryId
          ? statusDialog.category.updatedAt
          : categories.find((category) => category.id === categoryId)?.updatedAt,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function confirmDeactivation() {
    if (!statusDialog) return;

    const saved = await saveCategoryStatus(statusDialog.category.id, false);
    if (!saved) return;

    focusFallbackRef.current = true;
    setStatusDialog(null);
    focusVisibilityControl();
  }

  async function reactivateCategory(category: CategoryOverviewItem) {
    const saved = await saveCategoryStatus(category.id, true);
    if (saved) focusVisibilityControl();
  }

  const statusFailureIsReactivation =
    statusMutation.error !== null && statusMutation.variables?.isActive === true;

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <header className="mb-6 flex flex-col gap-5 border-b border-foreground pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-label text-muted-foreground">Categories</p>
          <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            Budget overview
          </h1>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end md:justify-end">
          {onSpaceChange !== undefined && (
            <div className="grid w-full gap-1 md:w-56">
              <Label htmlFor="categories-space">Active Space</Label>
              <Select
                value={spaceId ?? "personal"}
                onOpenChange={setSpacePickerOpen}
                onValueChange={(value) =>
                  onSpaceChange(value === "personal" ? undefined : value)
                }
              >
                <SelectTrigger
                  id="categories-space"
                  aria-label="Active Space"
                  disabled={filtersDisabled}
                >
                  <SelectValue
                    placeholder={
                      spaceId === undefined
                        ? "Personal Space"
                        : `Space ${spaceId}`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal Space</SelectItem>
                  {spacesQuery.isPending && (
                    <SelectItem value="loading" disabled>
                      Loading Spaces…
                    </SelectItem>
                  )}
                  {spacesQuery.isError && (
                    <SelectItem value="error" disabled>
                      Spaces unavailable
                    </SelectItem>
                  )}
                  {spacesQuery.data
                    ?.filter((space) => space.kind === "shared")
                    .map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        Shared Space · {space.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <ReportingPeriodFilter
            id="categories-reporting-period"
            disabled={filtersDisabled}
          />
          <CreateCategoryDialog
            className="w-full md:w-auto"
            disabled={filtersDisabled}
            spaceId={spaceId}
          />
        </div>
      </header>

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="Budget summary"
        aria-busy={categoriesQuery.isFetching}
      >
        <MetricCard
          label="Total monthly Budget"
          value={formatMoney(totalBudget)}
          detail={periodLabel}
          className="col-span-2 min-w-0 md:col-span-1"
        />
        <MetricCard
          label="Spent"
          value={formatMoney(totalSpent)}
          detail={periodLabel}
          emphasized
          className="min-w-0"
        />
        <MetricCard
          label="Remaining"
          value={formatMoney(totalRemaining)}
          detail={`${budgetedCategoryCount} monthly Budgets`}
          className="min-w-0"
        />
        <MetricCard
          label="Categories"
          value={categories.length.toString()}
          detail={`${activeCategoryCount} active`}
          className="col-span-2 min-w-0 md:col-span-1 max-md:[&_[data-slot=card-content]]:min-h-0 max-md:[&_[data-slot=card-content]]:py-3"
        />
      </section>

      <Card variant="strong" className="mt-5">
        <CardHeader className="gap-4 border-b md:flex-row md:items-end md:justify-between">
          <CardTitle>Monthly Budgets</CardTitle>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            <div className="relative order-1 w-full min-w-0 md:order-2 md:w-96 md:flex-none">
              <SearchIcon
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                type="search"
                value={search}
                placeholder="Search Category names"
                aria-label="Search Category names"
                onChange={(event) => setSearch(event.target.value)}
                disabled={filtersDisabled}
              />
            </div>
            <div className="order-2 flex min-h-11 w-full shrink-0 items-center gap-2 border-t pt-3 md:order-1 md:w-auto md:border-t-0 md:pt-0">
              <Checkbox
                id="categories-show-inactive"
                className="size-6"
                checked={showInactive}
                onCheckedChange={(checked) =>
                  setShowInactive(checked === true)
                }
                disabled={filtersDisabled}
              />
              <Label htmlFor="categories-show-inactive">
                Show inactive Categories
              </Label>
            </div>
          </div>
        </CardHeader>
        {statusFailureIsReactivation && (
          <CategoryStatusFailureAlert
            className="m-4 mb-0"
            message={statusMutation.error.message}
          />
        )}
        <section
          aria-label="Mobile Budget category list"
          className="md:hidden"
        >
          <ul
            aria-label="Mobile Budget Categories"
            className="grid gap-3 p-4"
          >
            {categoriesToRender.map((category) => (
              <MobileCategoryCard
                key={category.id}
                allCategories={categories}
                category={category}
                spaceId={spaceId}
                disabled={filtersDisabled}
                isStatusPending={
                  isStatusMutationPending &&
                  statusMutation.variables?.categoryId === category.id
                }
                onDeactivate={openDeactivation}
                onEditingChange={(open) =>
                  setMobileEditingCategoryId(open ? category.id : null)
                }
                onReactivate={reactivateCategory}
              />
            ))}
            {categoriesToRender.length === 0 && (
              <li className="border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
                {emptyMessage}
              </li>
            )}
          </ul>
        </section>

        <section
          aria-label="Desktop Budget category table"
          className="hidden md:block"
        >
          <Table aria-label="Desktop Budget Categories">
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Monthly Budget</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoriesToRender.map((category) => (
              editingCategoryId === category.id ? (
                <EditCategoryRow
                  key={category.id}
                  category={category}
                  spaceId={spaceId}
                  onCancel={() => setEditingCategoryId(null)}
                  onSaved={() => setEditingCategoryId(null)}
                />
              ) : (
                <TableRow
                  key={category.id}
                  aria-busy={
                    isStatusMutationPending &&
                    statusMutation.variables?.categoryId === category.id
                  }
                  className={category.isActive ? undefined : "bg-muted/50"}
                >
                  <TableCell className="min-w-64 whitespace-normal">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CategoryBadge categoryId={category.id} color={category.color}>
                          {category.name}
                        </CategoryBadge>
                        {!category.isActive && (
                          <Badge variant="muted">Inactive</Badge>
                        )}
                      </div>
                      {category.description && (
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                          {category.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {category.budget === null ? (
                      <span className="text-sm text-muted-foreground">
                        No monthly Budget
                      </span>
                    ) : (
                      formatMoney(category.budget)
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(category.spent)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {category.remaining === null ? (
                      <span
                        aria-label="Not budgeted"
                        className="text-muted-foreground"
                      >
                        —
                      </span>
                    ) : (
                      formatMoney(category.remaining)
                    )}
                  </TableCell>
                  <TableCell className="min-w-36">
                    {category.usage === null ? (
                      <span className="text-sm text-muted-foreground">
                        Not budgeted
                      </span>
                    ) : (
                      <>
                        <Progress
                          value={category.usage}
                          aria-label={`${category.name}: ${category.usage}% used`}
                        />
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {category.usage}% used
                        </p>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {category.isActive ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingCategoryId(category.id)}
                          disabled={filtersDisabled}
                          aria-label={`Edit ${category.name}`}
                        >
                          <PencilIcon aria-hidden="true" />
                        </Button>
                        {spaceId === undefined && (
                          <MatchingRulesDialog
                            allCategories={categories}
                            category={category}
                            disabled={filtersDisabled}
                          />
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={(event) =>
                            openDeactivation(category, event.currentTarget)
                          }
                          disabled={filtersDisabled}
                          aria-label={`Deactivate ${category.name}`}
                        >
                          <ArchiveIcon aria-hidden="true" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void reactivateCategory(category)}
                          disabled={filtersDisabled}
                          aria-label={`Reactivate ${category.name}`}
                        >
                          <RotateCcwIcon aria-hidden="true" />
                          {isStatusMutationPending &&
                          statusMutation.variables?.categoryId === category.id
                            ? "Reactivating…"
                            : "Reactivate"}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            ))}
            {categoriesToRender.length === 0 && (
              <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </section>
      </Card>
      <Dialog
        open={statusDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeStatusDialog();
        }}
      >
        {statusDialog && (
          <DialogContent
            aria-busy={statusMutation.isPending}
            onCloseAutoFocus={handleStatusDialogCloseAutoFocus}
          >
            <DialogHeader>
              <DialogTitle>
                Deactivate {statusDialog.category.name}?
              </DialogTitle>
              <DialogDescription>
                Historical Transactions and spending will remain, but{" "}
                {statusDialog.category.name} will stop being available for
                future Category assignments.
              </DialogDescription>
            </DialogHeader>
            {statusMutation.error && (
              <CategoryStatusFailureAlert
                className="m-5 mb-0"
                message={statusMutation.error.message}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeStatusDialog}
                disabled={statusMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmDeactivation()}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending
                  ? `Deactivating ${statusDialog.category.name}…`
                  : "Deactivate Category"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export { CategoriesPage };
