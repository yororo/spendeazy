import {
  AlertCircleIcon,
  CheckIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { formatExactMoney } from "@/shared/money";

import type { CategoryEditorController } from "./category-editor";
import { CategoryColorPicker } from "./category-color-picker";
import type { CategoryOverviewItem } from "./categories-service";

type CategoryEditorLayout = "dialog" | "inline";

interface CategoryEditorDetailsFieldsProps {
  readonly category: CategoryOverviewItem;
  readonly editor: CategoryEditorController;
  readonly layout: CategoryEditorLayout;
}

interface CategoryEditorBudgetFieldProps {
  readonly category: CategoryOverviewItem;
  readonly editor: CategoryEditorController;
  readonly formId?: string;
  readonly layout: CategoryEditorLayout;
}

type CategoryEditorFieldsProps = CategoryEditorBudgetFieldProps;

interface CategoryEditorFeedbackProps {
  readonly className?: string;
  readonly editor: CategoryEditorController;
  readonly layout: CategoryEditorLayout;
}

interface CategoryEditorActionsProps {
  readonly category: CategoryOverviewItem;
  readonly editor: CategoryEditorController;
  readonly formId?: string;
  readonly layout: CategoryEditorLayout;
}

interface CategoryEditorDiscardDialogProps {
  readonly editor: CategoryEditorController;
  readonly layout: CategoryEditorLayout;
}

function CategoryEditorDetailsFields({
  category,
  editor,
  layout,
}: CategoryEditorDetailsFieldsProps) {
  const fieldPrefix = `edit-category-${category.id}`;
  const showLabels = layout === "dialog";
  const nameInput = (
    <Input
      id={`${fieldPrefix}-name`}
      value={editor.draft.name}
      maxLength={100}
      autoFocus={showLabels}
      aria-label={`Category name for ${category.name}`}
      aria-invalid={editor.categoryNameError ? true : undefined}
      aria-describedby={
        editor.categoryNameError ? `${fieldPrefix}-name-error` : undefined
      }
      onChange={(event) => editor.updateDraft("name", event.target.value)}
      disabled={editor.isSaving}
    />
  );
  const descriptionInput = (
    <Textarea
      id={`${fieldPrefix}-description`}
      value={editor.draft.description}
      maxLength={500}
      rows={2}
      aria-label={`Description for ${category.name}`}
      aria-invalid={editor.errors.description ? true : undefined}
      aria-describedby={
        editor.errors.description
          ? `${fieldPrefix}-description-error`
          : undefined
      }
      onChange={(event) =>
        editor.updateDraft("description", event.target.value)
      }
      disabled={editor.isSaving}
    />
  );
  const nameError = editor.categoryNameError && (
    <p
      id={`${fieldPrefix}-name-error`}
      role="alert"
      className="text-sm text-destructive"
    >
      {editor.categoryNameError}
    </p>
  );
  const descriptionError = editor.errors.description && (
    <p
      id={`${fieldPrefix}-description-error`}
      role="alert"
      className="text-sm text-destructive"
    >
      {editor.errors.description}
    </p>
  );

  if (!showLabels) {
    return (
      <div className="grid gap-2">
        {nameInput}
        {descriptionInput}
        {nameError}
        {descriptionError}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        <Label htmlFor={`${fieldPrefix}-name`}>
          Category name <span className="text-destructive">*</span>
        </Label>
        {nameInput}
        {nameError}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${fieldPrefix}-description`}>Description</Label>
        {descriptionInput}
        {descriptionError}
      </div>
    </div>
  );
}

function CategoryEditorBudgetField({
  category,
  editor,
  formId,
  layout,
}: CategoryEditorBudgetFieldProps) {
  const fieldPrefix = `edit-category-${category.id}`;
  const showLabels = layout === "dialog";

  if (editor.budgetIsYearly) {
    return (
      <div className={showLabels ? "grid gap-2" : "text-left"}>
        {showLabels && (
          <p className="text-label text-muted-foreground">Budget</p>
        )}
        <p className="font-mono tabular-nums">
          {formatExactMoney(editor.yearlyBudgetAmount ?? "0.00")} / year
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Yearly Budget is preserved; monthly editing is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className={showLabels ? "grid gap-2" : undefined}>
      {showLabels && (
        <Label htmlFor={`${fieldPrefix}-budget`}>Monthly Budget</Label>
      )}
      <Input
        id={`${fieldPrefix}-budget`}
        type="text"
        inputMode="decimal"
        value={editor.draft.budget}
        form={formId}
        aria-label={`Monthly Budget for ${category.name}`}
        aria-invalid={editor.errors.budget ? true : undefined}
        aria-describedby={`${fieldPrefix}-budget-help${
          editor.errors.budget ? ` ${fieldPrefix}-budget-error` : ""
        }`}
        onChange={(event) => editor.updateDraft("budget", event.target.value)}
        disabled={editor.isSaving}
        className={
          showLabels
            ? "font-mono tabular-nums"
            : "ml-auto max-w-48 text-right font-mono tabular-nums"
        }
      />
      <p
        id={`${fieldPrefix}-budget-help`}
        className="mt-1 text-left text-xs text-muted-foreground"
      >
        Recurs independently of the selected Reporting Period.
      </p>
      {editor.errors.budget && (
        <p
          id={`${fieldPrefix}-budget-error`}
          role="alert"
          className="mt-1 text-left text-sm text-destructive"
        >
          {editor.errors.budget}
        </p>
      )}
    </div>
  );
}

function CategoryEditorColorField({
  category,
  editor,
  layout,
}: CategoryEditorDetailsFieldsProps) {
  return (
    <CategoryColorPicker
      className={layout === "inline" ? "mt-4" : undefined}
      idPrefix={`edit-category-${category.id}`}
      value={editor.draft.color}
      disabled={editor.isSaving}
      onChange={(color) => editor.updateDraft("color", color)}
    />
  );
}

function CategoryEditorFields({
  category,
  editor,
  formId,
  layout,
}: CategoryEditorFieldsProps) {
  if (layout === "dialog") {
    return (
      <div className="grid gap-5 p-5">
        <CategoryEditorDetailsFields
          category={category}
          editor={editor}
          layout={layout}
        />
        <CategoryEditorColorField
          category={category}
          editor={editor}
          layout={layout}
        />
        <CategoryEditorBudgetField
          category={category}
          editor={editor}
          formId={formId}
          layout={layout}
        />
      </div>
    );
  }

  return (
    <>
      <CategoryEditorDetailsFields
        category={category}
        editor={editor}
        layout={layout}
      />
      <CategoryEditorColorField
        category={category}
        editor={editor}
        layout={layout}
      />
      <CategoryEditorBudgetField
        category={category}
        editor={editor}
        formId={formId}
        layout={layout}
      />
    </>
  );
}

function CategoryEditorFeedback({
  className,
  editor,
  layout,
}: CategoryEditorFeedbackProps) {
  if (!editor.categoryAlertError && !editor.budgetError) return null;

  const feedback = (
    <>
      {editor.categoryAlertError && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Category details could not be saved</AlertTitle>
          <AlertDescription>
            {editor.categoryAlertError.message}
          </AlertDescription>
        </Alert>
      )}
      {editor.budgetError && (
        <Alert
          className={
            layout === "inline" && editor.categoryAlertError
              ? "mt-2"
              : undefined
          }
          variant={editor.detailsHaveBeenSaved ? "warning" : "destructive"}
        >
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>
            {editor.detailsHaveBeenSaved
              ? "Category details saved; Budget not saved"
              : "Budget could not be saved"}
          </AlertTitle>
          <AlertDescription>
            <p>{editor.budgetError.message}</p>
            {editor.detailsHaveBeenSaved && (
              <p className="mt-1">
                Your monthly Budget input is preserved. Retry to save it without
                repeating the Category update.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  );

  if (className) return <div className={className}>{feedback}</div>;
  if (layout === "inline") return feedback;

  return <div className="grid gap-2">{feedback}</div>;
}

function CategoryEditorActions({
  category,
  editor,
  formId,
  layout,
}: CategoryEditorActionsProps) {
  if (layout === "inline") {
    return (
      <div className="flex justify-end gap-1">
        <Button
          type="submit"
          form={formId}
          size="icon-sm"
          disabled={editor.isSaving}
          aria-label={editor.saveButtonLabel}
        >
          {editor.isSaving ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <CheckIcon aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={editor.requestCancel}
          disabled={editor.isSaving}
          aria-label={`Cancel changes to ${category.name}`}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={editor.requestCancel}
        disabled={editor.isSaving}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={editor.isSaving}
        aria-label={editor.saveButtonLabel}
      >
        {editor.isSaving && (
          <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
        )}
        {editor.saveButtonLabel}
      </Button>
    </>
  );
}

function CategoryEditorDiscardDialog({
  editor,
  layout,
}: CategoryEditorDiscardDialogProps) {
  return (
    <Dialog
      open={editor.discardPrompt}
      onOpenChange={(open) => {
        if (!open) editor.keepEditing();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard Category changes?</DialogTitle>
          <DialogDescription>
            Your unsaved {layout === "inline" ? "inline" : "Category"} changes
            will be cleared. Changes already saved to the Category will remain
            saved.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={editor.keepEditing}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={editor.discardChanges}
          >
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  CategoryEditorActions,
  CategoryEditorBudgetField,
  CategoryEditorDetailsFields,
  CategoryEditorColorField,
  CategoryEditorDiscardDialog,
  CategoryEditorFeedback,
  CategoryEditorFields,
};
