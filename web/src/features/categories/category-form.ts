import {
  isCategoryColor,
  type CategoryColor,
} from "@/shared/category";

interface CategoryFormValues {
  readonly name: string;
  readonly description: string;
  readonly budget: string;
  readonly color: CategoryColor;
}

interface NormalizedCategoryFormValues {
  readonly name: string;
  readonly description: string | null;
  readonly budgetAmount: string | null;
  readonly color: CategoryColor;
}

interface CategoryFormErrors {
  name?: string;
  description?: string;
  budget?: string;
  color?: string;
}

interface CategoryFormValidationResult {
  readonly errors: CategoryFormErrors;
  readonly values: NormalizedCategoryFormValues;
}

const INVALID_BUDGET_MESSAGE =
  "Budget must be a positive amount with at most two decimal places.";

function normalizeBudgetAmount(value: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return null;

  const match = /^(\d+)(?:\.(\d{0,2}))?$/u.exec(trimmedValue);
  if (!match) return null;

  const normalizedIntegerPart = match[1].replace(/^0+(?=\d)/u, "");
  const normalizedFractionPart = (match[2] ?? "").padEnd(2, "0");
  if (
    normalizedIntegerPart.length > 13 ||
    (normalizedIntegerPart === "0" && normalizedFractionPart === "00")
  ) {
    return null;
  }

  return `${normalizedIntegerPart}.${normalizedFractionPart}`;
}

function validateCategoryForm(
  form: CategoryFormValues,
): CategoryFormValidationResult {
  const name = form.name.trim();
  const descriptionText = form.description.trim();
  const description = descriptionText || null;
  const budgetAmount = normalizeBudgetAmount(form.budget);
  const color = isCategoryColor(form.color) ? form.color : null;
  const errors: CategoryFormErrors = {};

  if (name.length === 0) {
    errors.name = "Category name is required.";
  } else if (name.length > 100) {
    errors.name = "Category name must be 100 characters or fewer.";
  }

  if (descriptionText.length > 500) {
    errors.description = "Description must be 500 characters or fewer.";
  }

  if (form.budget.trim().length > 0 && budgetAmount === null) {
    errors.budget = INVALID_BUDGET_MESSAGE;
  }
  if (color === null) {
    errors.color = "Choose a Category Color.";
  }

  return {
    errors,
    values: {
      name,
      description,
      budgetAmount,
      color: color ?? "coral",
    },
  };
}

export {
  INVALID_BUDGET_MESSAGE,
  normalizeBudgetAmount,
  validateCategoryForm,
};
export type {
  CategoryFormErrors,
  CategoryFormValidationResult,
  CategoryFormValues,
  NormalizedCategoryFormValues,
};
