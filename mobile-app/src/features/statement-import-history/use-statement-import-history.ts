import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createStatementImportHistoryApiClient } from "@/api/statement-import-history-api-client";
import { useAuthorizedClient } from "@/application/authorized-client";
import { useSpaces } from "@/application/spaces/provider";
import {
  ALL_DATES,
  createHistoryWorkflow,
  filterError,
  routeHistoryFilters,
  type HistoryFilters,
} from "./history-workflow";

export function useStatementImportHistory(
  route: { sourceSpaceId?: unknown; fromDate?: unknown; toDate?: unknown } = {},
  pageSize = 100,
) {
  const { active, loading: spacesLoading, error: spacesError } = useSpaces();
  const authorized = useAuthorizedClient();
  const api = useMemo(
    () => createStatementImportHistoryApiClient(authorized),
    [authorized],
  );
  const scopeKey = JSON.stringify([authorized.scope, active?.id]);
  // Apply route filters only on entry. A later Space/session lifetime starts unfiltered.
  const [selection, setSelection] = useState(() => ({
    scopeKey,
    userId: authorized.scope.userId,
    awaitingSpace: !active,
    filters: routeHistoryFilters(route, active?.id ?? null),
  }));
  const awaitingInitialSpace =
    selection.awaitingSpace && selection.userId === authorized.scope.userId;
  const resetFilters = awaitingInitialSpace
    ? routeHistoryFilters(route, active?.id ?? null)
    : ALL_DATES;
  if (selection.scopeKey !== scopeKey)
    setSelection({
      scopeKey,
      userId: authorized.scope.userId,
      awaitingSpace: awaitingInitialSpace && !active,
      filters: resetFilters,
    });
  const filters =
    selection.scopeKey === scopeKey ? selection.filters : resetFilters;
  const workflow = useMemo(
    () =>
      createHistoryWorkflow(
        active?.id ?? null,
        filters,
        authorized.isCurrent,
        api.list,
        pageSize,
      ),
    [active?.id, filters, authorized, api, pageSize],
  );
  const state = useSyncExternalStore(
    workflow.subscribe,
    workflow.snapshot,
    workflow.snapshot,
  );
  useEffect(() => {
    void workflow.refresh();
    return () => workflow.cancel();
  }, [workflow]);
  function changeFilters(filters: HistoryFilters) {
    setSelection({
      scopeKey,
      userId: authorized.scope.userId,
      awaitingSpace: false,
      filters,
    });
  }
  return {
    active,
    filters,
    changeFilters,
    filterError: filterError(filters),
    items: state.page?.items ?? [],
    nextCursor: state.page?.nextCursor ?? null,
    error: state.error,
    loading: !!active && !state.page && !state.error && !filterError(filters),
    refreshing: !!state.page && state.operation?.kind === "replace",
    loadingMore: state.operation?.kind === "append",
    refresh: () => {
      void workflow.refresh();
    },
    retry: () => {
      void workflow.retry();
    },
    loadMore: workflow.loadMore,
    importerName: (id: string) =>
      spacesLoading
        ? "Loading importer…"
        : spacesError
          ? "Importer unavailable"
          : (active?.members.find((member) => member.id === id)?.name ??
            "Deleted user"),
  };
}
