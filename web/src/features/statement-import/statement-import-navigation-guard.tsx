import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";

interface StatementImportNavigationGuard {
  readonly requestExit: (action: NavigationAction) => void;
  readonly dialog: ReactNode;
}

type GuardedImportStage = "categorize" | "review";

interface PendingNavigation {
  readonly action: NavigationAction;
  readonly guardKey: object | null;
}

function useStatementImportNavigationGuard(
  options: {
    readonly enabled: boolean;
    readonly guardKey: object | null;
    readonly stage: GuardedImportStage;
    readonly onDiscard: () => void;
  },
): StatementImportNavigationGuard {
  const { enabled, guardKey, onDiscard, stage } = options;
  const { registerNavigationGuard, requestNavigation } = useNavigationGuard();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);

  const onNavigationAttempt = useCallback((action: NavigationAction) => {
    setPendingNavigation((current) =>
      current?.guardKey === guardKey ? current : { action, guardKey },
    );
  }, [guardKey]);

  useEffect(() => {
    return registerNavigationGuard({
      enabled,
      onNavigationAttempt,
    });
  }, [enabled, onNavigationAttempt, registerNavigationGuard]);

  useEffect(() => {
    if (!enabled) return;

    function preventStatementDiscard(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", preventStatementDiscard);
    return () =>
      window.removeEventListener("beforeunload", preventStatementDiscard);
  }, [enabled]);

  const requestExit = useCallback(
    (action: NavigationAction) => {
      if (!requestNavigation(action)) action();
    },
    [requestNavigation],
  );

  const cancelExit = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const pendingAction =
    enabled && pendingNavigation?.guardKey === guardKey
      ? pendingNavigation.action
      : null;

  const confirmExit = useCallback(() => {
    const action = pendingAction;
    setPendingNavigation(null);
    onDiscard();
    action?.();
  }, [onDiscard, pendingAction]);

  const stageLabel = stage === "review" ? "Review" : "Categorize";
  const stageDescription =
    stage === "review"
      ? "Your reviewed statement is still open. Leaving now will discard the statement and any changes you have made."
      : "Your statement is still being categorized. Leaving now will discard the statement and any changes you have made.";

  return {
    requestExit,
    dialog: (
      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) cancelExit();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Statement Import?</DialogTitle>
            <DialogDescription>{stageDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelExit}>
              Stay in {stageLabel}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmExit}>
              Leave {stageLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}

export { useStatementImportNavigationGuard };
export type { GuardedImportStage };
