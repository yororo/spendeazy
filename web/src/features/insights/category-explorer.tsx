import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  budgetStatusLabels,
  describeBudget,
  getBudgetStatus,
  type BudgetReviewHistory,
} from "@/shared/budget";
import { getCategoryColorClass } from "@/shared/category";
import { centsToMoney, formatMoney } from "@/shared/money";
import type { ReportingPeriod } from "@/shared/reporting-period";
import { BudgetReviewItem } from "./budget-review-evidence";
import { SpendingPatternEvidence } from "./spending-pattern-evidence";
import type {
  InsightsCategory,
  InsightsMonthlyReport,
} from "./insights-service";

const CATEGORY_PREVIEW_COUNT = 5;
const FILTERS = [
  { key: "attention", label: "Needs attention" },
  { key: "all", label: "All Categories" },
  { key: "review", label: "Budget review" },
  { key: "unbudgeted", label: "No monthly Budget" },
  { key: "patterns", label: "Spending changes" },
] as const;
type CategoryFilter = (typeof FILTERS)[number]["key"];

interface CategoryExplorerState {
  readonly filter: CategoryFilter;
  readonly search: string;
  readonly expanded: boolean;
  readonly selected: string | null;
}

interface CategoryExplorerProps {
  readonly report: InsightsMonthlyReport;
  readonly initialState?: CategoryExplorerState;
  readonly onViewTransactions?: (
    categoryId: string | undefined,
    period: ReportingPeriod,
    state: CategoryExplorerState,
  ) => void;
  readonly onEditBudget?: (
    categoryId: string,
    period: ReportingPeriod,
    evidence?: BudgetReviewHistory,
  ) => void;
}

const money = (cents: number) => formatMoney(centsToMoney(cents));
const categoryStatus = (category: InsightsCategory) =>
  category.monthlyBudgetCents === null
    ? null
    : getBudgetStatus(category.spendingCents, category.monthlyBudgetCents);
const priority = (category: InsightsCategory) =>
  ({ over: 0, limit: 1, near: 2, within: 3 })[
    categoryStatus(category) ?? "within"
  ];

function CategoryExplorer({
  report,
  initialState,
  onViewTransactions,
  onEditBudget,
}: CategoryExplorerProps) {
  const [state, setState] = useState<CategoryExplorerState>(
    initialState ?? {
      filter: "attention",
      search: "",
      expanded: false,
      selected: null,
    },
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const matchesSearch = (category: InsightsCategory) =>
    category.label.toLowerCase().includes(state.search.trim().toLowerCase());
  const matchesFilter = (
    category: InsightsCategory,
    filter: CategoryFilter,
  ) => {
    switch (filter) {
      case "all":
        return true;
      case "attention":
        return (
          category.monthlyBudgetCents !== null &&
          categoryStatus(category) !== "within"
        );
      case "review":
        return report.budgetReviews.some(
          (review) => review.categoryId === category.id && review.suggestReview,
        );
      case "unbudgeted":
        return category.monthlyBudgetCents === null;
      case "patterns":
        return (
          !report.spendingPatterns.future &&
          report.spendingPatterns.categories.some(
            (pattern) =>
              pattern.category.id === category.id &&
              pattern.status === "potential",
          )
        );
    }
  };
  const filtered = report.selectedMonthCategories
    .filter(
      (category) =>
        matchesFilter(category, state.filter) && matchesSearch(category),
    )
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        b.spendingCents - a.spendingCents ||
        a.label.localeCompare(b.label) ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    );
  const visible = state.expanded
    ? filtered
    : filtered.slice(0, CATEGORY_PREVIEW_COUNT);
  const category = report.selectedMonthCategories.find(
    (category) => category.id === state.selected,
  );
  const pattern = report.spendingPatterns.categories.find(
    (pattern) => pattern.category.id === category?.id,
  );
  const review = report.budgetReviews.find(
    (review) => review.categoryId === category?.id,
  );

  function updateSelection(id: string) {
    const opening = state.selected !== id;
    setState({ ...state, selected: opening ? id : null });
    if (opening && window.innerWidth < 1024)
      requestAnimationFrame(() =>
        detail.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
  }

  return (
    <section aria-label="Category explorer">
      <Card>
        <CardHeader>
          <h2 className="font-mono text-xl font-bold">Explore Categories</h2>
          <p className="text-sm text-muted-foreground">
            Start with Categories nearing or exceeding a monthly limit. Select
            one to look closer.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div
            role="group"
            aria-label="Filter Categories"
            className="flex flex-wrap gap-2"
          >
            {FILTERS.map(({ key, label }) => (
              <Button
                key={key}
                variant={state.filter === key ? "secondary" : "outline"}
                className="min-h-11 h-auto whitespace-normal py-2"
                aria-pressed={state.filter === key}
                onClick={() =>
                  setState({
                    ...state,
                    filter: key,
                    expanded: false,
                    selected: null,
                  })
                }
              >
                {label} (
                {
                  report.selectedMonthCategories.filter(
                    (category) =>
                      matchesFilter(category, key) && matchesSearch(category),
                  ).length
                }
                )
              </Button>
            ))}
          </div>
          <div>
            <label
              htmlFor="insights-category-search"
              className="mb-2 block text-sm font-semibold"
            >
              Find a Category
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                ref={searchInput}
                id="insights-category-search"
                className="min-h-11 min-w-0 flex-1"
                placeholder="Search Categories"
                value={state.search}
                onChange={(event) =>
                  setState({
                    ...state,
                    search: event.target.value,
                    expanded: false,
                    selected: null,
                  })
                }
              />
              {state.search && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setState({
                      ...state,
                      search: "",
                      expanded: false,
                      selected: null,
                    });
                    searchInput.current?.focus();
                  }}
                >
                  Clear search
                </Button>
              )}
            </div>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            Showing {visible.length} of {filtered.length} matching{" "}
            {filtered.length === 1 ? "Category" : "Categories"}.
          </p>
          {filtered.length === 0 && (
            <div className="border border-border bg-muted p-4">
              <p className="text-sm">
                {state.search
                  ? "No Categories match this search and filter."
                  : state.filter === "attention"
                    ? "No recorded Category spending is nearing or exceeding a monthly limit."
                    : state.filter === "patterns"
                      ? "No increases meet the comparison criteria. More recorded history may be needed."
                      : "No Categories match this filter."}
              </p>
              {report.selectedMonthCategories.length > 0 && (
                <Button
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() =>
                    setState({
                      filter: "all",
                      search: "",
                      expanded: false,
                      selected: null,
                    })
                  }
                >
                  Show all Categories
                </Button>
              )}
            </div>
          )}
          <div
            className={`grid items-start gap-5 ${category ? "lg:grid-cols-2" : ""}`}
          >
            <div className="grid gap-3">
              <ul aria-label="Matching Categories" className="grid gap-2">
                {visible.map((category) => {
                  const status = categoryStatus(category);
                  const id = category.id!;
                  return (
                    <li key={id}>
                      <button
                        id={`insights-category-${id}`}
                        type="button"
                        aria-expanded={state.selected === id}
                        aria-controls="insights-category-detail"
                        aria-label={`Review ${category.label}: ${status ? budgetStatusLabels[status] : "No monthly Budget"}`}
                        className={`focus-ledger grid min-h-11 w-full min-w-0 gap-3 border p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] ${state.selected === id ? "border-foreground bg-muted" : "border-border hover:bg-muted"}`}
                        onClick={() => updateSelection(id)}
                      >
                        <span className="grid min-w-0 gap-2">
                          <span className="flex min-w-0 items-center gap-2 font-semibold">
                            {category.color && (
                              <span
                                aria-hidden="true"
                                className={`size-3 shrink-0 ${getCategoryColorClass(category.color)}`}
                              />
                            )}
                            <span className="min-w-0 break-words">
                              {category.label}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground">
                            <span className="font-mono tabular-nums">
                              {money(category.spendingCents)}
                            </span>{" "}
                            recorded
                            {category.monthlyBudgetCents === null
                              ? " · No monthly limit"
                              : ` / ${money(category.monthlyBudgetCents)} monthly limit`}
                          </span>
                        </span>
                        <span className="grid content-center gap-1 sm:text-right">
                          <span
                            className={`text-sm font-semibold ${status === "over" ? "text-destructive" : status === "near" || status === "limit" ? "text-warning" : "text-muted-foreground"}`}
                          >
                            {status
                              ? budgetStatusLabels[status]
                              : "No monthly Budget"}
                          </span>
                          <span className="text-sm underline">
                            {state.selected === id
                              ? "Close details −"
                              : "View details +"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filtered.length > CATEGORY_PREVIEW_COUNT && (
                <Button
                  variant="outline"
                  className="min-h-11 h-auto justify-self-start whitespace-normal py-2"
                  onClick={() =>
                    setState({
                      ...state,
                      expanded: !state.expanded,
                      selected: null,
                    })
                  }
                >
                  {state.expanded
                    ? "Show fewer Categories"
                    : `Show all ${filtered.length} matching Categories`}
                </Button>
              )}
            </div>
            <div
              id="insights-category-detail"
              role={category ? "region" : undefined}
              aria-label={category ? `${category.label} details` : undefined}
              ref={detail}
              className="min-w-0 scroll-mt-24"
            >
              {category && (
                <div className="grid min-w-0 gap-4 border border-structure p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="break-words text-lg font-semibold">
                      {category.label}
                    </h3>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setState({ ...state, selected: null });
                        (
                          document.getElementById(
                            `insights-category-${category.id}`,
                          ) ??
                          document.getElementById("insights-category-search")
                        )?.focus();
                      }}
                    >
                      Close details
                    </Button>
                  </div>
                  <p className="text-sm">
                    {category.monthlyBudgetCents === null
                      ? "No monthly Budget"
                      : describeBudget(
                          category.spendingCents,
                          category.monthlyBudgetCents,
                        )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {onViewTransactions && (
                      <Button
                        id={`insights-transactions-${category.id}`}
                        className="min-h-11 max-w-full h-auto whitespace-normal py-2"
                        variant="outline"
                        aria-label={`View ${category.label} Transactions`}
                        onClick={() =>
                          onViewTransactions(
                            category.id ?? undefined,
                            report.period,
                            state,
                          )
                        }
                      >
                        View Transactions
                      </Button>
                    )}
                    {onEditBudget && category.id !== null && (
                      <Button
                        id={`insights-edit-budget-${category.id}`}
                        className="min-h-11 max-w-full h-auto whitespace-normal py-2"
                        variant="outline"
                        aria-label={`${category.monthlyBudgetCents === null ? "Set" : "Edit"} ${category.label} Budget`}
                        onClick={() =>
                          onEditBudget(category.id!, report.period)
                        }
                      >
                        {category.monthlyBudgetCents === null
                          ? "Set Budget / View yearly Budget"
                          : "Edit Budget"}
                      </Button>
                    )}
                  </div>
                  {pattern && (
                    <details>
                      <summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">
                        Spending changes & contributing expenses +
                      </summary>
                      <SpendingPatternEvidence
                        report={{
                          ...report.spendingPatterns,
                          categories: [pattern],
                        }}
                        period={report.period}
                        onViewTransactions={
                          onViewTransactions
                            ? (id, period) =>
                                onViewTransactions(id, period, state)
                            : undefined
                        }
                      />
                    </details>
                  )}
                  {review && (
                    <details>
                      <summary className="focus-ledger min-h-11 cursor-pointer py-3 text-sm font-semibold">
                        Does this Category’s Budget still fit? +
                      </summary>
                      <BudgetReviewItem
                        review={review}
                        period={report.period}
                        idPrefix="insights-category-review"
                        onEditBudget={onEditBudget}
                      />
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export { CategoryExplorer };
export type { CategoryExplorerState };
