import { ArrowRightIcon, CheckCircle2Icon, LandmarkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActiveSpaceLabel } from "@/shared/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { CommittedStatementImport } from "./statement-import-service";

interface ImportSuccessProps {
  committedImport: CommittedStatementImport;
  destinationLabel?: string;
  importerName?: string;
  spaceId?: string;
  onImportAnother: () => void;
  onViewTransactions: () => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAccount(committedImport: CommittedStatementImport) {
  return [committedImport.provider, committedImport.accountType]
    .filter(Boolean)
    .join(" · ");
}

function ImportSuccess({
  committedImport,
  destinationLabel,
  importerName,
  spaceId,
  onImportAnother,
  onViewTransactions,
}: ImportSuccessProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-screen-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-screen lg:px-9 lg:py-7">
      <header>
        <ActiveSpaceLabel spaceId={spaceId} />
        <p className="text-label text-muted-foreground">Imports / Complete</p>
        <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          Statement imported
        </h1>
      </header>

      <main className="grid flex-1 place-content-center">
        <Card variant="strong" className="w-full max-w-2xl">
          <CardHeader className="border-foreground bg-primary text-primary-foreground">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-content-center bg-secondary text-primary">
                <CheckCircle2Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="uppercase">Import complete</CardTitle>
                <CardDescription className="mt-1 text-primary-foreground">
                  The reviewed statement details and Transactions are now saved.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-label text-muted-foreground">File</dt>
                <dd className="mt-1 truncate font-mono text-sm font-semibold">
                  {committedImport.fileName}
                </dd>
              </div>
              <div>
                <dt className="text-label text-muted-foreground">Account</dt>
                <dd className="mt-1 flex items-center gap-2 font-mono text-sm font-semibold uppercase">
                  <LandmarkIcon className="size-4" aria-hidden="true" />
                  {formatAccount(committedImport)}
                </dd>
              </div>
              {destinationLabel && (
                <div>
                  <dt className="text-label text-muted-foreground">
                    Destination
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-semibold uppercase">
                    {destinationLabel}
                  </dd>
                </div>
              )}
              {importerName && (
                <div>
                  <dt className="text-label text-muted-foreground">
                    Imported by
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-semibold uppercase">
                    {importerName}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-label text-muted-foreground">
                  Statement date
                </dt>
                <dd className="mt-1 font-mono text-sm font-semibold uppercase">
                  {dateFormatter.format(
                    new Date(`${committedImport.statementDate}T00:00:00Z`),
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-label text-muted-foreground">
                  Transactions saved
                </dt>
                <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">
                  {committedImport.transactionCount}
                </dd>
              </div>
            </dl>

            <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
              Imports cannot be undone. Check your Transactions if you need to
              review the saved entries.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onImportAnother}>
                Import another statement
              </Button>
              <Button variant="secondary" onClick={onViewTransactions}>
                View Transactions
                <ArrowRightIcon className="text-primary" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export { ImportSuccess };
