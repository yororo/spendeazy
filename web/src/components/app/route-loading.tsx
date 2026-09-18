import { LoaderCircleIcon } from "lucide-react";

function RouteLoading() {
  return (
    <div
      className="grid min-h-[calc(100vh-4rem)] place-content-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 font-mono text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <LoaderCircleIcon className="size-5 animate-spin" aria-hidden="true" />
        Loading page
      </div>
    </div>
  );
}

export { RouteLoading };
