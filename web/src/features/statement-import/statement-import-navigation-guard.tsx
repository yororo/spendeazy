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

function useStatementImportNavigationGuard(
  enabled: boolean,
): StatementImportNavigationGuard {
  const { registerNavigationGuard, requestNavigation } = useNavigationGuard();
  const [pendingAction, setPendingAction] = useState<NavigationAction | null>(
    null,
  );

  const onNavigationAttempt = useCallback((action: NavigationAction) => {
    setPendingAction((current) => current ?? action);
  }, []);

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
    setPendingAction(null);
  }, []);

  const confirmExit = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  }, [pendingAction]);

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
            <DialogDescription>
              Your statement is still being categorized. Leaving now will
              discard the statement and any changes you have made.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelExit}>
              Stay in Categorize
            </Button>
            <Button type="button" variant="destructive" onClick={confirmExit}>
              Leave Categorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}

export { useStatementImportNavigationGuard };
