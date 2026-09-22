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
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
} from "./transactions-queries";
import type { Transaction } from "./transactions-service";

interface TransactionEditorDialogProps {
  readonly open: boolean;
  readonly transaction: Transaction | null;
  readonly categories: readonly CategoryCatalogItem[];
  readonly spaceId?: string;
  readonly allowImportedStatementFactEdits?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly onReload: () => Promise<unknown>;
}

interface TransactionDraft {
  purchaseDate: string;
  description: string;
  amount: string;
  categoryId: string;
}

function createDraft(transaction: Transaction | null): TransactionDraft {
  return {
    purchaseDate:
      transaction?.purchaseDate ?? new Date().toISOString().slice(0, 10),
    description: transaction?.description ?? "",
    amount:
      transaction === null ? "" : Math.abs(transaction.amount).toFixed(2),
    categoryId: transaction?.categoryId ?? "",
  };
}

function TransactionEditorDialog({
  open,
  transaction,
  categories,
  spaceId,
  allowImportedStatementFactEdits = false,
  onOpenChange,
  onSaved,
  onReload,
}: TransactionEditorDialogProps) {
  const [initialDraft] = useState(() => createDraft(transaction));
  const [draft, setDraft] = useState(() => createDraft(transaction));
  const createMutation = useCreateTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const mutation = transaction === null ? createMutation : updateMutation;
  const closeRequestedRef = useRef(false);
  const isImported = transaction?.source === "imported";
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
          .getElementById("transaction-description")
          ?.closest<HTMLElement>('[role="dialog"]') ?? null,
      focusTarget: () => document.getElementById("transaction-description"),
      label: "Transaction",
      onDiscard: closeEditor,
    });
  const categoryOptions = categories.filter(
    (category) =>
      category.isActive || category.id === (draft.categoryId || undefined),
  );

  function updateDraft(changes: Partial<TransactionDraft>) {
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
      if (transaction === null) {
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
                transactionId: transaction.id,
                categoryId: draft.categoryId || null,
                updatedAt: transaction.updatedAt,
              }
            : {
                spaceId,
                transactionId: transaction.id,
                purchaseDate: draft.purchaseDate,
                description: draft.description,
                amount: draft.amount,
                categoryId: draft.categoryId || null,
                updatedAt: transaction.updatedAt,
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
            {transaction === null
              ? "Record Transaction"
              : importedStatementFactsAreImmutable
                ? "Categorize Transaction"
                : "Edit Transaction"}
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
                    ? "Transaction changed elsewhere."
                    : "Transaction could not be saved."}
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
              <Label htmlFor="transaction-purchase-date">Purchase date</Label>
              <Input
                id="transaction-purchase-date"
                type="date"
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
              <Label htmlFor="transaction-description">Description</Label>
              <Input
                id="transaction-description"
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
              <Label htmlFor="transaction-amount">Amount</Label>
              <Input
                id="transaction-amount"
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
              <Label htmlFor="transaction-category">Category</Label>
              <Select
                value={draft.categoryId || "uncategorized"}
                onValueChange={(value) =>
                  updateDraft({ categoryId: value === "uncategorized" ? "" : value })
                }
                disabled={mutation.isPending}
              >
                <SelectTrigger id="transaction-category">
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
                : transaction === null
                  ? "Record Transaction"
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

export { TransactionEditorDialog };
