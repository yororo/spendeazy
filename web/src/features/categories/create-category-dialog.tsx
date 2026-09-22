import { useState, type FormEvent } from "react";
import { AlertCircleIcon, CheckCircle2Icon, PlusIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_CATEGORY_COLOR, type CategoryColor } from "@/shared/category";
import {
  isNavigationIntentEvent,
  useUnsavedChangesNavigationGuard,
} from "@/shared/navigation";

import {
  useCreateCategoryBudgetMutation,
  useCreateCategoryMutation,
} from "./categories-queries";
import { CategoryColorPicker } from "./category-color-picker";
import type { CategoryCatalogItem } from "@/shared/category";
import {
  validateCategoryForm,
  type CategoryFormErrors,
  type CategoryFormValues,
} from "./category-form";
import { isCategoryNameConflict } from "./category-errors";

const EMPTY_FORM: CategoryFormValues = {
  name: "",
  description: "",
  budget: "",
  color: DEFAULT_CATEGORY_COLOR,
};

function getCategoryNameConflictMessage(error: Error | null) {
  if (!isCategoryNameConflict(error)) return null;

  return error?.message || "A Category with this name already exists.";
}

interface CreateCategoryDialogProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly spaceId?: string;
}

function CreateCategoryDialog({
  className,
  disabled = false,
  spaceId,
}: CreateCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [form, setForm] = useState<CategoryFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<CategoryFormErrors>({});
  const createCategoryMutation = useCreateCategoryMutation();
  const createBudgetMutation = useCreateCategoryBudgetMutation();
  const savedCategory = createCategoryMutation.data ?? null;

  const hasUnsavedChanges =
    form.name.length > 0 ||
    form.description.length > 0 ||
    form.budget.length > 0 ||
    form.color !== DEFAULT_CATEGORY_COLOR;
  const isSaving =
    createCategoryMutation.isPending || createBudgetMutation.isPending;
  const categoryNameConflictMessage = getCategoryNameConflictMessage(
    createCategoryMutation.error,
  );
  const nameError = errors.name ?? categoryNameConflictMessage;

  function resetForm() {
    setForm(EMPTY_FORM);
    setErrors({});
    setDiscardPrompt(false);
    createCategoryMutation.reset();
    createBudgetMutation.reset();
  }

  function closeDialog() {
    resetForm();
    setOpen(false);
  }

  const { dialog: navigationGuardDialog } =
    useUnsavedChangesNavigationGuard({
      enabled: open && hasUnsavedChanges,
      focusScope: () =>
        document
          .getElementById("new-category-name")
          ?.closest<HTMLElement>('[role="dialog"]') ?? null,
      focusTarget: () => document.getElementById("new-category-name"),
      label: "Category",
      onDiscard: closeDialog,
    });

  function requestClose() {
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setDiscardPrompt(true);
      return;
    }

    closeDialog();
  }

  function guardDismiss(event: Event) {
    if (isNavigationIntentEvent(event)) {
      event.preventDefault();
      return;
    }

    if (isSaving || hasUnsavedChanges) event.preventDefault();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }

    if (discardPrompt) {
      setDiscardPrompt(false);
      return;
    }

    requestClose();
  }

  function discardChanges() {
    closeDialog();
  }

  function updateForm<K extends keyof CategoryFormValues>(
    field: K,
    value: CategoryFormValues[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (
      savedCategory === null &&
      (field === "name" || field === "description" || field === "color")
    ) {
      createCategoryMutation.reset();
    }
    if (field === "budget") createBudgetMutation.reset();
  }

  async function saveBudget(categoryId: string, amount: string) {
    try {
      await createBudgetMutation.mutateAsync({ categoryId, amount, spaceId });
    } catch {
      return false;
    }

    return true;
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const validation = validateCategoryForm(form);
    setErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) return;

    if (savedCategory) {
      if (validation.values.budgetAmount === null) {
        setErrors({
          budget: "Enter a Budget amount to retry the monthly Budget.",
        });
        return;
      }

      if (
        await saveBudget(
          savedCategory.id,
          validation.values.budgetAmount,
        )
      ) {
        closeDialog();
      }
      return;
    }

    let category: CategoryCatalogItem;
    try {
      category = await createCategoryMutation.mutateAsync({
        input: {
          name: validation.values.name,
          description: validation.values.description,
          color: validation.values.color,
          spaceId,
        },
      });
    } catch {
      return;
    }

    if (validation.values.budgetAmount === null) {
      closeDialog();
      return;
    }

    if (
      await saveBudget(category.id, validation.values.budgetAmount)
    ) {
      closeDialog();
    }
  }

  return (
    <>
      <Dialog modal={false} open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className={className}
            disabled={disabled}
          >
            <PlusIcon aria-hidden="true" />
            New Category
          </Button>
        </DialogTrigger>
        <DialogContent
          onInteractOutside={guardDismiss}
          overlayClassName={discardPrompt ? undefined : "pointer-events-none"}
        >
        {discardPrompt ? (
          <>
            <DialogHeader>
              <DialogTitle>Discard new Category?</DialogTitle>
              <DialogDescription>
                Your changed creation form will be cleared. A Category already
                saved during this session will remain saved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDiscardPrompt(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={discardChanges}
              >
                Discard changes
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submitForm} noValidate>
            <DialogHeader>
              <DialogTitle>New Category</DialogTitle>
              <DialogDescription>
                Create an active Category for your spending and optionally add
                a monthly Budget.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 p-5">
              {createCategoryMutation.error && !categoryNameConflictMessage && (
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden="true" />
                  <AlertTitle>Category could not be created</AlertTitle>
                  <AlertDescription>
                    {createCategoryMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              {savedCategory && createBudgetMutation.error && (
                <Alert variant="warning">
                  <CheckCircle2Icon aria-hidden="true" />
                  <AlertTitle>Category saved; Budget not saved</AlertTitle>
                  <AlertDescription>
                    <p>
                      Category “{savedCategory.name}” was created. Retry the
                      monthly Budget without creating the Category again.
                    </p>
                    <p className="mt-2">
                      {createBudgetMutation.error.message}
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Label htmlFor="new-category-name">
                  Category name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-category-name"
                  value={form.name}
                  maxLength={100}
                  required
                  disabled={savedCategory !== null}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={
                    nameError ? "new-category-name-error" : undefined
                  }
                  onChange={(event) => updateForm("name", event.target.value)}
                />
                {nameError && (
                  <p
                    id="new-category-name-error"
                    className="text-sm text-destructive"
                  >
                    {nameError}
                  </p>
                )}
                {!nameError && (
                  <p className="text-xs text-muted-foreground">
                    Up to 100 characters.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="new-category-description">Description</Label>
                <Textarea
                  id="new-category-description"
                  value={form.description}
                  maxLength={500}
                  disabled={savedCategory !== null}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={
                    errors.description
                      ? "new-category-description-error"
                      : undefined
                  }
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                />
                {errors.description && (
                  <p
                    id="new-category-description-error"
                    className="text-sm text-destructive"
                  >
                    {errors.description}
                  </p>
                )}
                {!errors.description && (
                  <p className="text-xs text-muted-foreground">
                    Optional, up to 500 characters.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <CategoryColorPicker
                  idPrefix="new-category"
                  value={form.color}
                  disabled={savedCategory !== null || isSaving}
                  onChange={(color: CategoryColor) => updateForm("color", color)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="new-category-budget">
                  Monthly Budget <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="new-category-budget"
                  type="text"
                  inputMode="decimal"
                  value={form.budget}
                  disabled={isSaving}
                  aria-invalid={errors.budget ? true : undefined}
                  aria-describedby={`new-category-budget-help${
                    errors.budget ? " new-category-budget-error" : ""
                  }`}
                  onChange={(event) => updateForm("budget", event.target.value)}
                />
                <p
                  id="new-category-budget-help"
                  className="text-xs text-muted-foreground"
                >
                  Positive amounts only. This Budget recurs independently of
                  the selected Reporting Period; yearly creation is not
                  available here.
                </p>
                {errors.budget && (
                  <p
                    id="new-category-budget-error"
                    className="text-sm text-destructive"
                  >
                    {errors.budget}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving…"
                  : savedCategory
                    ? "Retry Budget"
                    : "Save Category"}
              </Button>
            </DialogFooter>
          </form>
        )}
        </DialogContent>
      </Dialog>
      {navigationGuardDialog}
    </>
  );
}

export { CreateCategoryDialog };
