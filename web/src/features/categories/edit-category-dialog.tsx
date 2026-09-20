import {
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  AlertCircleIcon,
  LoaderCircleIcon,
  PencilIcon,
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
  DialogTrigger,
} from "@/components/ui/dialog";

import { useCategoryEditor } from "./category-editor";
import { useCategoryBudgetQuery } from "./categories-queries";
import {
  CategoryEditorActions,
  CategoryEditorDiscardDialog,
  CategoryEditorFeedback,
  CategoryEditorFields,
} from "./category-editor-form";
import type {
  CategoryBudget,
  CategoryOverviewItem,
} from "./categories-service";

interface EditCategoryDialogProps {
  readonly category: CategoryOverviewItem;
  readonly spaceId?: string;
  readonly disabled?: boolean;
  readonly onEditingChange?: (open: boolean) => void;
}

interface EditCategoryDialogBaseProps {
  readonly category: CategoryOverviewItem;
  readonly spaceId?: string;
  readonly onCancel: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}

interface EditCategoryDialogContentProps extends EditCategoryDialogBaseProps {
  readonly onSaved: () => void;
}

interface EditCategoryDialogStatusProps extends EditCategoryDialogBaseProps {
  readonly ariaBusy?: boolean;
  readonly children: ReactNode;
}

function EditCategoryDialogHeader({
  category,
}: {
  readonly category: CategoryOverviewItem;
}) {
  return (
    <DialogHeader>
      <DialogTitle>Edit {category.name}</DialogTitle>
      <DialogDescription>
        Update {category.name} and its monthly Budget.
      </DialogDescription>
    </DialogHeader>
  );
}

function EditCategoryDialogStatus({
  ariaBusy = false,
  category,
  children,
  onCancel,
  onCloseAutoFocus,
}: EditCategoryDialogStatusProps) {
  return (
    <DialogContent aria-busy={ariaBusy} onCloseAutoFocus={onCloseAutoFocus}>
      <EditCategoryDialogHeader category={category} />
      {children}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface EditCategoryBudgetErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

function EditCategoryBudgetError({
  message,
  onRetry,
}: EditCategoryBudgetErrorProps) {
  return (
    <Alert className="m-5 mb-0" variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>Budget details could not be loaded</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={onRetry}
        >
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function EditCategoryDialogContent({
  category,
  spaceId,
  onCancel,
  onSaved,
  onCloseAutoFocus,
}: EditCategoryDialogContentProps) {
  const budgetQuery = useCategoryBudgetQuery(category.id, spaceId);

  if (!budgetQuery.isFetchedAfterMount) {
    if (budgetQuery.isError) {
      return (
        <EditCategoryDialogStatus
          category={category}
          onCancel={onCancel}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <EditCategoryBudgetError
            message={
              budgetQuery.error?.message ??
              "Try again to load Budget details."
            }
            onRetry={() => void budgetQuery.refetch()}
          />
        </EditCategoryDialogStatus>
      );
    }

    return (
      <EditCategoryDialogStatus
        ariaBusy
        category={category}
        onCancel={onCancel}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div
          className="flex items-center gap-3 border-b p-5"
          role="status"
          aria-live="polite"
        >
          <LoaderCircleIcon className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-label">
            Loading authoritative Budget for {category.name}…
          </span>
        </div>
      </EditCategoryDialogStatus>
    );
  }

  if (budgetQuery.data === undefined) {
    return (
      <EditCategoryDialogStatus
        category={category}
        onCancel={onCancel}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <EditCategoryBudgetError
          message="Try again to load Budget details."
          onRetry={() => void budgetQuery.refetch()}
        />
      </EditCategoryDialogStatus>
    );
  }

  return (
    <ReadyEditCategoryDialog
      authoritativeBudget={budgetQuery.data}
      category={category}
      spaceId={spaceId}
      onCancel={onCancel}
      onSaved={onSaved}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}

interface ReadyEditCategoryDialogProps
  extends Omit<EditCategoryDialogContentProps, "onCloseAutoFocus"> {
  readonly authoritativeBudget: CategoryBudget | null;
  readonly onCloseAutoFocus: (event: Event) => void;
}

function ReadyEditCategoryDialog({
  authoritativeBudget,
  category,
  spaceId,
  onCancel,
  onSaved,
  onCloseAutoFocus,
}: ReadyEditCategoryDialogProps) {
  const editor = useCategoryEditor({
    authoritativeBudget,
    category,
    spaceId,
    onCancel,
    onSaved,
  });
  const formId = `mobile-edit-category-${category.id}`;

  function guardDismiss(event: Event | MouseEvent<HTMLButtonElement>) {
    if (editor.isSaving) {
      event.preventDefault();
      return;
    }

    if (editor.hasUnsavedChanges) {
      event.preventDefault();
      editor.requestCancel();
    }
  }

  return (
    <>
      <DialogContent
        aria-busy={editor.isSaving}
        closeButtonDisabled={editor.isSaving}
        onEscapeKeyDown={guardDismiss}
        onFocusOutside={guardDismiss}
        onInteractOutside={guardDismiss}
        onPointerDownOutside={guardDismiss}
        onCloseButtonClick={guardDismiss}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form id={formId} onSubmit={editor.submit} noValidate>
          <EditCategoryDialogHeader category={category} />
          <CategoryEditorFields
            category={category}
            editor={editor}
            formId={formId}
            layout="dialog"
          />
          <CategoryEditorFeedback
            editor={editor}
            className="grid gap-2 px-5 pb-5"
            layout="dialog"
          />
          <DialogFooter>
            <CategoryEditorActions
              category={category}
              editor={editor}
              formId={formId}
              layout="dialog"
            />
          </DialogFooter>
        </form>
      </DialogContent>
      <CategoryEditorDiscardDialog editor={editor} layout="dialog" />
    </>
  );
}

function EditCategoryDialog({
  category,
  spaceId,
  disabled = false,
  onEditingChange,
}: EditCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onEditingChange?.(nextOpen);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDialogOpen(true);
      return;
    }

    setDialogOpen(false);
  }

  function closeDialog() {
    setDialogOpen(false);
    window.setTimeout(focusTrigger, 0);
  }

  function focusTrigger() {
    if (triggerRef.current && document.body.contains(triggerRef.current)) {
      triggerRef.current.focus();
    }
  }

  function handleCloseAutoFocus(event: Event) {
    event.preventDefault();
    window.setTimeout(focusTrigger, 0);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Edit ${category.name}`}
        >
          <PencilIcon aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      {open && (
        <EditCategoryDialogContent
          category={category}
          spaceId={spaceId}
          onCancel={closeDialog}
          onSaved={closeDialog}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}
    </Dialog>
  );
}

export { EditCategoryDialog };
