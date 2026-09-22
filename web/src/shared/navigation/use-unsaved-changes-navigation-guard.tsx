import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useNavigationGuard } from "./use-navigation-guard";
import type { NavigationAction } from "./navigation-guard-context";

interface UnsavedChangesNavigationGuardOptions {
  readonly enabled: boolean;
  readonly focusScope?: () => HTMLElement | null;
  readonly focusTarget?: () => HTMLElement | null;
  readonly guardKey?: object | null;
  readonly label: string;
  readonly onDiscard: () => void;
  readonly description?: string;
  readonly discardLabel?: string;
  readonly stayLabel?: string;
  readonly title?: string;
}

interface UnsavedChangesNavigationGuard {
  readonly dialog: ReactNode;
  readonly requestExit: (action: NavigationAction) => void;
}

interface PendingNavigation {
  readonly action: NavigationAction;
  readonly guardKey: object | null;
}

function useUnsavedChangesNavigationGuard({
  enabled,
  focusScope,
  focusTarget,
  guardKey = null,
  label,
  onDiscard,
  description = `Your unsaved ${label} changes will be discarded.`,
  discardLabel = "Discard changes",
  stayLabel = "Stay in editor",
  title = `Leave ${label} editor?`,
}: UnsavedChangesNavigationGuardOptions): UnsavedChangesNavigationGuard {
  const { registerNavigationGuard, requestNavigation } = useNavigationGuard();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const wasPendingRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);

  const focusEditor = useCallback(() => {
    const lastFocusedElement = lastFocusedElementRef.current;
    if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
      return;
    }

    focusTarget?.()?.focus();
  }, [focusTarget]);

  useEffect(() => {
    const scope = focusScope?.();
    if (!scope) return;

    function rememberFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement) {
        lastFocusedElementRef.current = event.target;
      }
    }

    scope.addEventListener("focusin", rememberFocus);
    return () => scope.removeEventListener("focusin", rememberFocus);
  }, [focusScope]);

  const onNavigationAttempt = useCallback(
    (action: NavigationAction) => {
      setPendingNavigation((current) =>
        current?.guardKey === guardKey
          ? current
          : { action, guardKey },
      );
    },
    [guardKey],
  );

  useEffect(() => {
    return registerNavigationGuard({
      enabled,
      onNavigationAttempt,
    });
  }, [enabled, onNavigationAttempt, registerNavigationGuard]);

  useEffect(() => {
    if (!enabled) return;

    function preventBrowserUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", preventBrowserUnload);
    return () =>
      window.removeEventListener("beforeunload", preventBrowserUnload);
  }, [enabled]);

  useEffect(() => {
    if (
      wasPendingRef.current &&
      pendingNavigation === null &&
      shouldRestoreFocusRef.current
    ) {
      shouldRestoreFocusRef.current = false;
      focusEditor();
    }

    wasPendingRef.current = pendingNavigation !== null;
  }, [focusEditor, pendingNavigation]);

  const cancelNavigation = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setPendingNavigation(null);
  }, []);

  const requestExit = useCallback(
    (action: NavigationAction) => {
      if (!requestNavigation(action)) action();
    },
    [requestNavigation],
  );

  const discardChanges = useCallback(() => {
    shouldRestoreFocusRef.current = false;
    const action = pendingNavigation?.action;
    setPendingNavigation(null);
    onDiscard();
    action?.();
  }, [onDiscard, pendingNavigation]);

  const action =
    enabled && pendingNavigation?.guardKey === guardKey
      ? pendingNavigation.action
      : null;

  return {
    dialog: (
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) cancelNavigation();
        }}
      >
        <DialogContent
          data-navigation-guard-dialog="true"
          onCloseAutoFocus={(event) => {
            if (!shouldRestoreFocusRef.current) return;

            event.preventDefault();
            shouldRestoreFocusRef.current = false;
            focusEditor();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cancelNavigation}
            >
              {stayLabel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={discardChanges}
            >
              {discardLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    requestExit,
  };
}

export { useUnsavedChangesNavigationGuard };
export type {
  UnsavedChangesNavigationGuard,
  UnsavedChangesNavigationGuardOptions,
};
