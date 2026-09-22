import type { ReactNode } from "react";

import {
  useUnsavedChangesNavigationGuard,
  type NavigationAction,
} from "@/shared/navigation";

interface StatementImportNavigationGuard {
  readonly requestExit: (action: NavigationAction) => void;
  readonly dialog: ReactNode;
}

type GuardedImportStage = "categorize" | "review";

function useStatementImportNavigationGuard(
  options: {
    readonly enabled: boolean;
    readonly guardKey: object | null;
    readonly stage: GuardedImportStage;
    readonly onDiscard: () => void;
  },
): StatementImportNavigationGuard {
  const { enabled, guardKey, onDiscard, stage } = options;
  const stageLabel = stage === "review" ? "Review" : "Categorize";
  const stageDescription =
    stage === "review"
      ? "Your reviewed statement is still open. Leaving now will discard the statement and any changes you have made."
      : "Your statement is still being categorized. Leaving now will discard the statement and any changes you have made.";
  const { dialog, requestExit } = useUnsavedChangesNavigationGuard({
    description: stageDescription,
    discardLabel: `Leave ${stageLabel}`,
    enabled,
    guardKey,
    label: "Statement Import",
    onDiscard,
    stayLabel: `Stay in ${stageLabel}`,
    title: "Leave Statement Import?",
  });

  return { dialog, requestExit };
}

export { useStatementImportNavigationGuard };
export type { GuardedImportStage };
