import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/shared/money";

import { useCategoryEditor } from "./category-editor";
import { useCategoryBudgetQuery } from "./categories-queries";
import {
  CategoryEditorActions,
  CategoryEditorBudgetField,
  CategoryEditorColorField,
  CategoryEditorDetailsFields,
  CategoryEditorDiscardDialog,
  CategoryEditorFeedback,
} from "./category-editor-form";
import type {
  CategoryBudget,
  CategoryOverviewItem,
} from "./categories-service";

interface EditCategoryRowProps {
  readonly category: CategoryOverviewItem;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}

function CategoryBudgetLoadingRow({
  category,
}: {
  readonly category: CategoryOverviewItem;
}) {
  return (
    <TableRow className="bg-primary/10 hover:bg-primary/10">
      <TableCell colSpan={6} className="whitespace-normal">
        <div className="flex items-center gap-2 py-2" role="status">
          <LoaderCircleIcon
            className="size-4 animate-spin"
            aria-hidden="true"
          />
          <span className="font-mono text-xs font-semibold uppercase">
            Loading authoritative Budget for {category.name}…
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface CategoryBudgetErrorRowProps {
  readonly category: CategoryOverviewItem;
  readonly message: string;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
}

function CategoryBudgetErrorRow({
  category,
  message,
  onRetry,
  onCancel,
}: CategoryBudgetErrorRowProps) {
  return (
    <TableRow className="bg-primary/10 hover:bg-primary/10">
      <TableCell colSpan={6} className="whitespace-normal">
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Budget details could not be loaded</AlertTitle>
          <AlertDescription>
            <p>{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel editing {category.name}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </TableCell>
    </TableRow>
  );
}

interface ReadyEditCategoryRowProps extends EditCategoryRowProps {
  readonly authoritativeBudget: CategoryBudget | null;
}

function ReadyEditCategoryRow({
  authoritativeBudget,
  category,
  onCancel,
  onSaved,
}: ReadyEditCategoryRowProps) {
  const editor = useCategoryEditor({
    authoritativeBudget,
    category,
    onCancel,
    onSaved,
  });
  const formId = `edit-category-${category.id}`;

  return (
    <>
      <TableRow
        className="bg-primary/10 align-top hover:bg-primary/10"
        aria-busy={editor.isSaving}
      >
        <TableCell className="min-w-64 whitespace-normal">
          <form id={formId} onSubmit={editor.submit} noValidate>
            <CategoryEditorDetailsFields
              category={category}
              editor={editor}
              layout="inline"
            />
            <CategoryEditorColorField
              category={category}
              editor={editor}
              layout="inline"
            />
          </form>
        </TableCell>
        <TableCell className="min-w-48 text-right">
          <CategoryEditorBudgetField
            category={category}
            editor={editor}
            formId={formId}
            layout="inline"
          />
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {formatMoney(category.spent)}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          {category.remaining === null ? "—" : formatMoney(category.remaining)}
        </TableCell>
        <TableCell className="min-w-36">
          {category.usage === null ? (
            <span className="text-sm text-muted-foreground">Not budgeted</span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {category.usage}% used
            </span>
          )}
        </TableCell>
        <TableCell>
          <CategoryEditorActions
            category={category}
            editor={editor}
            formId={formId}
            layout="inline"
          />
        </TableCell>
      </TableRow>
      {(editor.categoryAlertError || editor.budgetError) && (
        <TableRow className="bg-primary/10 hover:bg-primary/10">
          <TableCell colSpan={6} className="py-2 whitespace-normal">
            <CategoryEditorFeedback editor={editor} layout="inline" />
          </TableCell>
        </TableRow>
      )}
      <CategoryEditorDiscardDialog editor={editor} layout="inline" />
    </>
  );
}

function EditCategoryRow({
  category,
  onCancel,
  onSaved,
}: EditCategoryRowProps) {
  const budgetQuery = useCategoryBudgetQuery(category.id);

  if (!budgetQuery.isFetchedAfterMount && budgetQuery.isError) {
    return (
      <CategoryBudgetErrorRow
        category={category}
        message={
          budgetQuery.error?.message ?? "Try again to load Budget details."
        }
        onRetry={() => void budgetQuery.refetch()}
        onCancel={onCancel}
      />
    );
  }

  if (!budgetQuery.isFetchedAfterMount) {
    return <CategoryBudgetLoadingRow category={category} />;
  }

  if (budgetQuery.data === undefined) {
    return (
      <CategoryBudgetErrorRow
        category={category}
        message="Try again to load Budget details."
        onRetry={() => void budgetQuery.refetch()}
        onCancel={onCancel}
      />
    );
  }

  return (
    <ReadyEditCategoryRow
      category={category}
      authoritativeBudget={budgetQuery.data}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

export { EditCategoryRow };
