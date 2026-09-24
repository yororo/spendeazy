import { AlertCircleIcon, InboxIcon, LoaderCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface FeatureDataLoadingProps {
  label: string;
}

function FeatureDataLoading({ label }: FeatureDataLoadingProps) {
  return (
    <div
      className="grid min-h-[24rem] place-content-center px-4 py-12"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <LoaderCircleIcon className="size-6 animate-spin" aria-hidden="true" />
        <p className="font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}

interface FeatureDataErrorProps {
  message?: string;
  onRetry: () => void;
}

interface FeatureDataEmptyProps {
  title: string;
  description: string;
}

function FeatureDataEmpty({ title, description }: FeatureDataEmptyProps) {
  return (
    <div className="mx-auto grid min-h-[24rem] w-full max-w-screen-2xl place-content-center px-4 py-12 sm:px-6 lg:px-9">
      <section className="flex max-w-lg items-start gap-3 border border-foreground p-4">
        <InboxIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </section>
    </div>
  );
}

function FeatureDataError({ message, onRetry }: FeatureDataErrorProps) {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-9 lg:py-7">
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertTitle>Unable to load this page</AlertTitle>
        <AlertDescription>
          <p>{message ?? "The data request failed. Try again."}</p>
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
    </div>
  );
}

export { FeatureDataEmpty, FeatureDataError, FeatureDataLoading };
