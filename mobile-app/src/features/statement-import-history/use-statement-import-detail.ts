import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createStatementImportHistoryApiClient } from "@/api/statement-import-history-api-client";
import { useAuthorizedClient } from "@/application/authorized-client";
import { useSpaces } from "@/application/spaces/provider";
import { useSpaceCategories } from "@/features/expenses/use-space-categories";
import {
  createImportDetailWorkflow,
  importRouteScope,
} from "./detail-workflow";

export function useStatementImportDetail(route: {
  sourceSpaceId?: unknown;
  statementImportId?: unknown;
}) {
  const authorized = useAuthorizedClient();
  const spaces = useSpaces();
  const scope = importRouteScope(route, spaces.active?.id ?? null);
  const spaceId = scope?.sourceSpaceId ?? null;
  const importId = scope?.statementImportId ?? null;
  const categories = useSpaceCategories(spaceId);
  const workflow = useMemo(
    () =>
      createImportDetailWorkflow(
        () =>
          !!spaceId &&
          !!importId &&
          authorized.scope.spaceId === spaceId &&
          authorized.isCurrent(),
        () =>
          createStatementImportHistoryApiClient(authorized).detail(
            spaceId!,
            importId!,
          ),
      ),
    [authorized, spaceId, importId],
  );
  const state = useSyncExternalStore(
    workflow.subscribe,
    workflow.snapshot,
    workflow.snapshot,
  );
  const refreshLabels = categories.reload;
  const refreshSpaces = useRef(spaces.refresh);
  useLayoutEffect(() => {
    refreshSpaces.current = spaces.refresh;
  }, [spaces.refresh]);
  // Space provider refresh does not replace the identity/Space request lifetime.
  const refresh = useCallback(() => {
    void workflow.refresh();
    if (spaceId) {
      refreshLabels();
      void refreshSpaces.current();
    }
  }, [workflow, spaceId, refreshLabels]);
  return {
    ...state,
    active: scope ? spaces.active : null,
    contextUnavailable: !scope,
    spacesLoading: spaces.loading,
    refresh,
    cancel: workflow.cancel,
    importer: spaces.loading
      ? "Loading importer…"
      : spaces.error
        ? "Importer unavailable"
        : (spaces.active?.members.find(
            (m) => m.id === state.detail?.importedByUserId,
          )?.name ?? "Deleted user"),
    categoryName: (id: string) =>
      categories.loading
        ? "Loading Category…"
        : categories.error
          ? "Category unavailable"
          : (categories.categories.find((c) => c.id === id)?.name ??
            "Category unavailable"),
  };
}
