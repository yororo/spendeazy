import type { CategoryBudget } from "./categories-service";

interface CategoryBudgetQueryState {
  readonly isFetchedAfterMount: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly data: CategoryBudget | null | undefined;
}

type CategoryBudgetReadiness =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly budget: CategoryBudget | null };

const BUDGET_LOAD_ERROR = "Try again to load Budget details.";

function getCategoryBudgetReadiness(
  query: CategoryBudgetQueryState,
): CategoryBudgetReadiness {
  if (!query.isFetchedAfterMount) {
    if (query.isError) {
      return { status: "error", message: query.error?.message ?? BUDGET_LOAD_ERROR };
    }
    return { status: "loading" };
  }

  if (query.data === undefined) {
    return { status: "error", message: BUDGET_LOAD_ERROR };
  }

  return { status: "ready", budget: query.data };
}

export { getCategoryBudgetReadiness };
