import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FeatureDataLoading } from "@/components/app/feature-data-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useTransactionActivityQuery } from "./transactions-queries";
import type { Transaction } from "./transactions-service";

interface TransactionActivityDialogProps {
  readonly open: boolean;
  readonly transaction: Transaction | null;
  readonly spaceId?: string;
  readonly onOpenChange: (open: boolean) => void;
}

const activityDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function TransactionActivityDialog({
  open,
  transaction,
  spaceId,
  onOpenChange,
}: TransactionActivityDialogProps) {
  const activityQuery = useTransactionActivityQuery(
    transaction?.id ?? null,
    spaceId,
    open && transaction !== null,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction activity</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {transaction
              ? `Activity for “${transaction.description}”.`
              : "Recorded activity for this Transaction."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5">
          {activityQuery.isPending && (
            <FeatureDataLoading label="Loading activity" />
          )}

          {activityQuery.isError && (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Activity could not be loaded.</AlertTitle>
              <AlertDescription>
                <p>{activityQuery.error.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void activityQuery.refetch()}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {activityQuery.isSuccess && activityQuery.data.length === 0 && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This Transaction predates detailed activity capture. Its
                existing Added By attribution remains available.
              </p>
              {transaction?.addedByUserId !== undefined && (
                <p className="font-medium text-foreground">
                  Added by User {transaction.addedByUserId}
                </p>
              )}
            </div>
          )}

          {activityQuery.isSuccess && activityQuery.data.length > 0 && (
            <ol className="space-y-4" aria-label="Transaction activity events">
              {activityQuery.data.map((activity) => (
                <li
                  key={activity.id}
                  className="border-l-2 border-foreground pl-4"
                >
                  <p className="font-mono text-sm font-bold uppercase">
                    Created
                  </p>
                  <p className="mt-1 text-sm">
                    Created by User {activity.actorUserId}
                  </p>
                  <time
                    className="mt-1 block text-xs text-muted-foreground"
                    dateTime={activity.occurredAt}
                  >
                    {activityDateFormatter.format(new Date(activity.occurredAt))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { TransactionActivityDialog };
