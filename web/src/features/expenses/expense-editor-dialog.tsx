import { useEffect, useRef, useState, type FormEvent } from "react";

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
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/shared/api";
import type { CategoryCatalogItem } from "@/shared/category";
import { useUnsavedChangesNavigationGuard } from "@/shared/navigation";

import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
} from "./expenses-queries";
import type { Expense } from "./expenses-service";

interface ExpenseEditorDialogProps {
  readonly open: boolean;
  readonly expense: Expense | null;
  readonly categories: readonly CategoryCatalogItem[];
  readonly spaceId?: string;
  readonly allowImportedStatementFactEdits?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly onReload: () => Promise<unknown>;
}

interface ExpenseDraft {
  purchaseDate: string;
  description: string;
  amount: string;
  categoryId: string;
}

function createDraft(expense: Expense | null): ExpenseDraft {
  return {
    purchaseDate:
      expense?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    description: expense?.description ?? "",
    amount:
      expense === null ? "" : Math.abs(expense.amount).toFixed(2),
    categoryId: expense?.categoryId ?? "",
  };
}

function ExpenseEditorDialog({
  open,
  expense,
  categories,
  spaceId,
  allowImportedStatementFactEdits = false,
  onOpenChange,
  onSaved,
  onReload,
}: ExpenseEditorDialogProps) {
  const [initialDraft] = useState(() => createDraft(expense));
  const [draft, setDraft] = useState(() => createDraft(expense));
  const createMutation = useCreateExpenseMutation();
  const updateMutation = useUpdateExpenseMutation();
  const mutation = expense === null ? createMutation : updateMutation;
  const closeRequestedRef = useRef(false);
  const isImported = expense?.source === "imported";
  const importedStatementFactsAreEditable =
    isImported && allowImportedStatementFactEdits;
  const importedStatementFactsAreImmutable =
    isImported && !allowImportedStatementFactEdits;
  const hasUnsavedChanges =
    draft.purchaseDate !== initialDraft.purchaseDate ||
    draft.description !== initialDraft.description ||
    draft.amount !== initialDraft.amount ||
    draft.categoryId !== initialDraft.categoryId;
  const { dialog: navigationGuardDialog, requestExit } =
    useUnsavedChangesNavigationGuard({
      enabled: open && hasUnsavedChanges,
      focusScope: () =>
        document
          .getElementById("expense-description")
          ?.closest<HTMLElement>('[role="dialog"]') ?? null,
      focusTarget: () => document.getElementById("expense-description"),
      label: "Expense",
      onDiscard: closeEditor,
    });
  const categoryOptions = categories.filter(
    (category) =>
      category.isActive || category.id === (draft.categoryId || undefined),
  );

  function updateDraft(changes: Partial<ExpenseDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  useEffect(() => {
    if (!open) closeRequestedRef.current = false;
  }, [open]);

  function closeEditor() {
    if (closeRequestedRef.current) return;

    closeRequestedRef.current = true;
    onOpenChange(false);
  }

  function requestClose() {
    if (mutation.isPending) return;

    requestExit(closeEditor);
  }

  function guardDismiss(event: Event) {
    if (mutation.isPending || hasUnsavedChanges) event.preventDefault();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (expense === null) {
        await createMutation.mutateAsync({
          spaceId,
          purchaseDate: draft.purchaseDate,
          description: draft.description,
          amount: draft.amount,
          categoryId: draft.categoryId || null,
        });
      } else {
        await updateMutation.mutateAsync(
          isImported && importedStatementFactsAreImmutable
            ? {
                spaceId,
                expenseId: expense.id,
                categoryId: draft.categoryId || null,
                updatedAt: expense.updatedAt,
              }
            : {
                spaceId,
                expenseId: expense.id,
                purchaseDate: draft.purchaseDate,
                description: draft.description,
                amount: draft.amount,
                categoryId: draft.categoryId || null,
                updatedAt: expense.updatedAt,
              },
        );
      }

      onSaved();
    } catch {
      // The mutation error is rendered below and the draft remains intact.
    }
  }

  const isStale =
    mutation.error instanceof ApiError && mutation.error.code === "STALE_EDIT";

  return (
    <>
      <Dialog
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          requestClose();
        }}
      >
        <DialogContent
          closeButtonDisabled={mutation.isPending}
          onInteractOutside={guardDismiss}
          overlayClassName="pointer-events-none"
        >
        <DialogHeader>
          <DialogTitle>
            {expense === null
              ? "Record Expense"
              : importedStatementFactsAreImmutable
                ? "Categorize Expense"
                : "Edit Expense"}
          </DialogTitle>
          <DialogDescription>
            {importedStatementFactsAreImmutable
              ? "Imported statement facts are fixed. You can update its Category."
              : importedStatementFactsAreEditable
                ? "Correct supported fields while retaining Statement Import provenance and Added By attribution."
                : "Record an expense in the selected Space."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 p-5">
            {mutation.error && (
              <Alert variant="destructive">
                <AlertTitle>
                  {isStale
                    ? "Expense changed elsewhere."
                    : "Expense could not be saved."}
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{mutation.error.message}</p>
                  {isStale && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void onReload();
                        onOpenChange(false);
                      }}
                    >
                      Reload and review
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="expense-purchase-date">Purchase date</Label>
              <DateInput
                id="expense-purchase-date"
                value={draft.purchaseDate}
                onChange={(event) =>
                  updateDraft({ purchaseDate: event.target.value })
                }
                required
                disabled={
                  importedStatementFactsAreImmutable || mutation.isPending
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-description">Description</Label>
              <Input
                id="expense-description"
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                required
                disabled={
                  importedStatementFactsAreImmutable || mutation.isPending
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                pattern="^(?=.*[1-9])\d{1,13}\.\d{2}$"
                value={draft.amount}
                onChange={(event) => updateDraft({ amount: event.target.value })}
                placeholder="0.00"
                required
                disabled={
                  importedStatementFactsAreImmutable || mutation.isPending
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={draft.categoryId || "uncategorized"}
                onValueChange={(value) =>
                  updateDraft({ categoryId: value === "uncategorized" ? "" : value })
                }
                disabled={mutation.isPending}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue placeholder="Choose a Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                      {!category.isActive ? " · Inactive" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : expense === null
                  ? "Record Expense"
                  : "Save changes"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {navigationGuardDialog}
    </>
  );
}

export { ExpenseEditorDialog };
