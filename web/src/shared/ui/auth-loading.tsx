import { LedgerMark } from "./ledger-mark";

interface AuthLoadingProps {
  message?: string;
}

function AuthLoading({ message = "Securing your session" }: AuthLoadingProps) {
  return (
    <div
      className="grid min-h-screen place-content-center bg-secondary text-secondary-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <LedgerMark interactive={false} />
        <span className="size-3 animate-pulse bg-inverse-accent" aria-hidden="true" />
        <span className="font-mono text-xs tracking-wider text-inverse-supporting uppercase">
          {message}
        </span>
      </div>
    </div>
  );
}

export { AuthLoading };
