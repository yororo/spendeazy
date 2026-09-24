import { AlertCircleIcon } from "lucide-react";

import { LedgerMark } from "@/shared/ui/ledger-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface AccountPreparationErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}

function AccountPreparationError({
  message,
  isRetrying,
  onRetry,
  onSignOut,
}: AccountPreparationErrorProps) {
  return (
    <main className="grid min-h-screen place-content-center bg-secondary px-4 py-8 text-secondary-foreground">
      <div className="w-full max-w-lg">
        <LedgerMark interactive={false} />
        <Alert
          variant="destructive"
          className="mt-8 bg-background text-foreground"
        >
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Unable to prepare your account</AlertTitle>
          <AlertDescription>
            <p>{message}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                disabled={isRetrying}
                onClick={onRetry}
              >
                {isRetrying ? "Retrying" : "Retry"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onSignOut}
              >
                Sign out
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </main>
  );
}

export { AccountPreparationError };
