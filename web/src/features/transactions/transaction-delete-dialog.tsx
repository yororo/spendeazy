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
  useDeleteTransactionMutation,
} from "./transactions-queries";
import type { Transaction } from "./transactions-service";

interface TransactionDeleteDialogProps {
  readonly open: boolean;
  readonly transaction: Transaction | null;
  readonly spaceId?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDeleted: () => void;
  readonly onReload: () => Promise<unknown>;
}

function TransactionDeleteDialog({
  open,
  transaction,
  spaceId,
  onOpenChange,
  onDeleted,
  onReload,
}: TransactionDeleteDialogProps) {
  const deleteMutation = useDeleteTransactionMutation();
  const [hasConfirmed, setHasConfirmed] = useState(false);

  if (transaction?.source === "imported") return null;

  const isStale =
    deleteMutation.error instanceof ApiError &&
    deleteMutation.error.code === "STALE_EDIT";

  async function confirmDelete() {
    if (!transaction) return;

    setHasConfirmed(true);
    try {
      await deleteMutation.mutateAsync({
        transactionId: transaction.id,
        spaceId,
        updatedAt: transaction.updatedAt,
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
          <DialogTitle>Delete Transaction?</DialogTitle>
          <DialogDescription>
            This removes “{transaction?.description}” from the selected Space.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          {deleteMutation.error && (
            <Alert variant="destructive">
              <AlertTitle>
                {isStale
                  ? "Transaction changed elsewhere."
                  : "Transaction could not be deleted."}
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
                : "Delete Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { TransactionDeleteDialog };
