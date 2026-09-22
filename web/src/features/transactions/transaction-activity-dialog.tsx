import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FeatureDataLoading } from "@/components/app/feature-data-state";
import { Button } from "@/components/ui/button";
import { formatExactMoney } from "@/shared/money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useTransactionActivityQuery } from "./transactions-queries";
import type {
  Transaction,
  TransactionActivity,
  TransactionActivitySnapshot,
} from "./transactions-service";

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
                    {activityLabel(activity.type)}
                  </p>
                  <p className="mt-1 text-sm">
                    {activityLabel(activity.type)} by
                    {" User "}
                    {activity.actorUserId}
                  </p>
                  <time
                    className="mt-1 block text-xs text-muted-foreground"
                    dateTime={activity.occurredAt}
                  >
                    {activityDateFormatter.format(new Date(activity.occurredAt))}
                  </time>
                  {activity.type === "edited" && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <TransactionActivitySnapshotView
                        label="Before"
                        snapshot={activity.before}
                      />
                      <TransactionActivitySnapshotView
                        label="After"
                        snapshot={activity.after}
                      />
                    </div>
                  )}
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

function activityLabel(type: TransactionActivity["type"]): string {
  return type === "created"
    ? "Created"
    : type === "deleted"
      ? "Deleted"
      : "Edited";
}

function TransactionActivitySnapshotView({
  label,
  snapshot,
}: {
  readonly label: string;
  readonly snapshot: TransactionActivitySnapshot;
}) {
  return (
    <div className="border p-3">
      <p className="text-label text-muted-foreground">{label}</p>
      <dl className="mt-2 grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Purchase date</dt>
          <dd className="font-mono">{snapshot.purchaseDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Description</dt>
          <dd className="wrap-anywhere">{snapshot.description}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd>{snapshot.categoryId ?? "Uncategorized"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-mono tabular-nums">
            {formatExactMoney(snapshot.amount)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export { TransactionActivityDialog };
