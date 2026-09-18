import { useState, type FormEvent } from "react";

import { ApiError } from "@/shared/api";
import { resolveCategoryColor, type CategoryColor } from "@/shared/category";

import {
  useDeleteCategoryBudgetMutation,
  useUpdateCategoryBudgetMutation,
  useUpdateCategoryMutation,
} from "./categories-queries";
import { isCategoryNameConflict } from "./category-errors";
import type {
  CategoryBudget,
  CategoryOverviewItem,
} from "./categories-service";
import {
  validateCategoryForm,
  type CategoryFormErrors,
  type CategoryFormValues,
} from "./category-form";

interface CategoryDetails {
  readonly name: string;
  readonly description: string;
  readonly color: CategoryColor;
}

interface UseCategoryEditorOptions {
  readonly authoritativeBudget: CategoryBudget | null;
  readonly category: CategoryOverviewItem;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}

interface CategoryEditorController {
  readonly budgetError: Error | null;
  readonly budgetIsYearly: boolean;
  readonly categoryAlertError: Error | null;
  readonly categoryNameError: string | undefined;
  readonly discardChanges: () => void;
  readonly discardPrompt: boolean;
  readonly detailsHaveBeenSaved: boolean;
  readonly draft: CategoryFormValues;
  readonly errors: CategoryFormErrors;
  readonly hasUnsavedChanges: boolean;
  readonly isSaving: boolean;
  readonly keepEditing: () => void;
  readonly requestCancel: () => void;
  readonly saveButtonLabel: string;
  readonly submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly updateDraft: <K extends keyof CategoryFormValues>(
    field: K,
    value: CategoryFormValues[K],
  ) => void;
  readonly yearlyBudgetAmount: string | null;
}

function getApiFieldError(error: Error | null, field: string) {
  if (!(error instanceof ApiError)) return null;

  return (
    error.details.find((detail) => detail.field === `/${field}`)?.message ??
    null
  );
}

function detailsEqual(left: CategoryDetails, right: CategoryDetails) {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.color === right.color
  );
}

function useCategoryEditor({
  authoritativeBudget,
  category,
  onCancel,
  onSaved,
}: UseCategoryEditorOptions): CategoryEditorController {
  const [initialDetails] = useState<CategoryDetails>(() => ({
    name: category.name,
    description: category.description ?? "",
    color: resolveCategoryColor(category.id, category.color),
  }));
  const [confirmedDetails, setConfirmedDetails] =
    useState<CategoryDetails>(initialDetails);
  const [draft, setDraft] = useState<CategoryFormValues>(() => ({
    name: category.name,
    description: category.description ?? "",
    color: resolveCategoryColor(category.id, category.color),
    budget:
      authoritativeBudget?.period === "monthly"
        ? authoritativeBudget.amount
        : "",
  }));
  const [errors, setErrors] = useState<CategoryFormErrors>({});
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const updateCategoryMutation = useUpdateCategoryMutation();
  const updateBudgetMutation = useUpdateCategoryBudgetMutation();
  const deleteBudgetMutation = useDeleteCategoryBudgetMutation();

  const budgetIsYearly = authoritativeBudget?.period === "yearly";
  const categoryError = updateCategoryMutation.error;
  const categoryAlertError =
    categoryError && !isCategoryNameConflict(categoryError)
      ? categoryError
      : null;
  const budgetError = updateBudgetMutation.error ?? deleteBudgetMutation.error;
  const categoryNameError =
    errors.name ??
    getApiFieldError(categoryError, "name") ??
    (isCategoryNameConflict(categoryError)
      ? categoryError?.message
      : undefined);
  const isSaving =
    updateCategoryMutation.isPending ||
    updateBudgetMutation.isPending ||
    deleteBudgetMutation.isPending;
  const hasUnsavedChanges =
    draft.name !== confirmedDetails.name ||
    draft.description !== confirmedDetails.description ||
    draft.color !== confirmedDetails.color ||
    (!budgetIsYearly &&
      draft.budget.trim() !==
        (authoritativeBudget?.period === "monthly"
          ? authoritativeBudget.amount
          : ""));
  const detailsHaveBeenSaved = !detailsEqual(confirmedDetails, initialDetails);
  const saveButtonLabel = isSaving
    ? `Saving changes to ${category.name}`
    : detailsHaveBeenSaved && budgetError
      ? `Retry Budget for ${category.name}`
      : `Save changes to ${category.name}`;

  function updateDraft<K extends keyof CategoryFormValues>(
    field: K,
    value: CategoryFormValues[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "name" || field === "description" || field === "color") {
      updateCategoryMutation.reset();
    }
    if (field === "budget") {
      updateBudgetMutation.reset();
      deleteBudgetMutation.reset();
    }
  }

  async function saveBudget(amount: string | null) {
    if (budgetIsYearly) return true;
    if (amount === null) {
      if (authoritativeBudget?.period !== "monthly") return true;

      try {
        await deleteBudgetMutation.mutateAsync(category.id);
      } catch {
        return false;
      }

      return true;
    }

    try {
      await updateBudgetMutation.mutateAsync({
        categoryId: category.id,
        amount,
      });
    } catch {
      return false;
    }

    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const validation = validateCategoryForm(draft);
    setErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) return;

    const nextDetails: CategoryDetails = {
      name: validation.values.name,
      description: validation.values.description ?? "",
      color: validation.values.color,
    };
    if (!detailsEqual(nextDetails, confirmedDetails)) {
      try {
        await updateCategoryMutation.mutateAsync({
          categoryId: category.id,
          name: nextDetails.name,
          description: validation.values.description,
          color: nextDetails.color,
        });
      } catch {
        return;
      }

      setConfirmedDetails(nextDetails);
    }

    if (await saveBudget(validation.values.budgetAmount)) {
      onSaved();
    }
  }

  function requestCancel() {
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setDiscardPrompt(true);
      return;
    }

    onCancel();
  }

  function discardChanges() {
    setDiscardPrompt(false);
    onCancel();
  }

  return {
    budgetError,
    budgetIsYearly,
    categoryAlertError,
    categoryNameError,
    discardChanges,
    discardPrompt,
    detailsHaveBeenSaved,
    draft,
    errors,
    hasUnsavedChanges,
    isSaving,
    keepEditing: () => setDiscardPrompt(false),
    requestCancel,
    saveButtonLabel,
    submit,
    updateDraft,
    yearlyBudgetAmount:
      authoritativeBudget?.period === "yearly"
        ? authoritativeBudget.amount
        : null,
  };
}

export { useCategoryEditor };
export type { CategoryEditorController };
