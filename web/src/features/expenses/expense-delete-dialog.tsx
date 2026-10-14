import { useState } from "react";

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
import { ApiError } from "@/shared/api";

import {
  useDeleteExpenseMutation,
} from "./expenses-queries";
import type { Expense } from "./expenses-service";

interface ExpenseDeleteDialogProps {
  readonly open: boolean;
  readonly expense: Expense | null;
  readonly spaceId?: string;
  readonly allowImportedDeletion?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDeleted: () => void;
  readonly onReload: () => Promise<unknown>;
}

function ExpenseDeleteDialog({
  open,
  expense,
  spaceId,
  allowImportedDeletion = false,
  onOpenChange,
  onDeleted,
  onReload,
}: ExpenseDeleteDialogProps) {
  const deleteMutation = useDeleteExpenseMutation();
  const [hasConfirmed, setHasConfirmed] = useState(false);

  if (expense?.source === "imported" && !allowImportedDeletion) {
    return null;
  }

  const isStale =
    deleteMutation.error instanceof ApiError &&
    deleteMutation.error.code === "STALE_EDIT";

  async function confirmDelete() {
    if (!expense) return;

    setHasConfirmed(true);
    try {
      await deleteMutation.mutateAsync({
        expenseId: expense.id,
        spaceId,
        updatedAt: expense.updatedAt,
      });
      onDeleted();
    } catch {
      // The mutation error is rendered below and keeps the dialog open.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deleteMutation.isPending) {
          setHasConfirmed(false);
          deleteMutation.reset();
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent closeButtonDisabled={deleteMutation.isPending}>
        <DialogHeader>
          <DialogTitle>Delete Expense?</DialogTitle>
          <DialogDescription>
            This removes “{expense?.description}” from the selected Space.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          {deleteMutation.error && (
            <Alert variant="destructive">
              <AlertTitle>
                {isStale
                  ? "Expense changed elsewhere."
                  : "Expense could not be deleted."}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{deleteMutation.error.message}</p>
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
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDelete()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? "Deleting…"
              : hasConfirmed
                ? "Delete again"
                : "Delete Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ExpenseDeleteDialog };
