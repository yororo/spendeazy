import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createExpenseApiClient } from "@/api/expense-api-client";
import { useAuthorizedClient } from "@/application/authorized-client";
import { useSpaces } from "@/application/spaces/provider";
import { useSpaceCategories } from "./use-space-categories";
import { createExpenseBrowseWorkflow } from "./browse-workflow";
import {
  emptyExpenseBrowse,
  expenseBrowseIssues,
  expenseBrowseSnapshot,
  expenseListQuery,
  readExpenseScroll,
  rememberExpenseScroll,
  subscribeExpenseBrowse,
  updateExpenseBrowse,
  type ExpenseBrowseSelection,
} from "./browse-state";

export function useExpenseBrowse({
  deletedOnly = false,
  fixedScope,
}: {
  deletedOnly?: boolean;
  fixedScope?: { sourceSpaceId: string; statementImportId: string };
} = {}) {
  const {
    active,
    refresh: refreshSpaces,
    loading: spacesLoading,
    refreshing: spacesRefreshing,
  } = useSpaces();
  const authorized = useAuthorizedClient();
  const browse = useSyncExternalStore(
    subscribeExpenseBrowse,
    expenseBrowseSnapshot,
    expenseBrowseSnapshot,
  );
  const spaceId =
    fixedScope &&
    (fixedScope.sourceSpaceId !== active?.id ||
      !/^[1-9]\d*$/.test(fixedScope.statementImportId))
      ? null
      : (active?.id ?? null);
  const localKey = JSON.stringify([authorized.scope, fixedScope, deletedOnly]);
  const [local, setLocal] = useState(() => ({
    key: localKey,
    selection: emptyExpenseBrowse(spaceId ?? ""),
  }));
  const localScroll = useRef({ key: localKey, offset: 0 });
  if (local.key !== localKey) {
    setLocal({ key: localKey, selection: emptyExpenseBrowse(spaceId ?? "") });
  }
  const selection = useMemo(
    () =>
      spaceId === null
        ? null
        : fixedScope
          ? {
              ...(local.key === localKey
                ? local.selection
                : emptyExpenseBrowse(spaceId)),
              spaceId,
              statementImportId: fixedScope.statementImportId,
            }
          : browse.selection?.spaceId === spaceId
            ? browse.selection
            : emptyExpenseBrowse(spaceId),
    [browse.selection, spaceId, fixedScope, local, localKey],
  );
  const categories = useSpaceCategories(spaceId);
  const issues = selection ? expenseBrowseIssues(selection) : [];
  const view = deletedOnly ? "deleted" : "active";
  const queryKey = selection
    ? JSON.stringify({
        deletedOnly,
        query: expenseListQuery(selection),
      })
    : "";
  const resource = useMemo(() => {
    const current = selection ?? emptyExpenseBrowse("");
    const isCurrent = () =>
      authorized.isCurrent() &&
      authorized.scope.spaceId === spaceId &&
      expenseBrowseSnapshot().listRevision === browse.listRevision &&
      (!!fixedScope ||
        JSON.stringify({
          deletedOnly,
          query: expenseListQuery(
            expenseBrowseSnapshot().selection ??
              emptyExpenseBrowse(spaceId ?? ""),
          ),
        }) === queryKey);
    const api = createExpenseApiClient(authorized);
    return createExpenseBrowseWorkflow(
      current,
      isCurrent,
      deletedOnly ? api.listDeletedExpenses : api.listExpenses,
    );
  }, [
    authorized,
    browse.listRevision,
    deletedOnly,
    queryKey,
    selection,
    spaceId,
    fixedScope,
  ]);
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.snapshot,
    resource.snapshot,
  );
  useEffect(() => {
    if (!spaceId) return;
    void resource.reload();
    return resource.cancel;
  }, [authorized, browse.listRevision, queryKey, resource, spaceId]);
  const loaded = issues.length === 0 ? state.loaded : null;
  const updateSelection = useCallback(
    (patch: Partial<Omit<ExpenseBrowseSelection, "spaceId">>) => {
      if (!spaceId || !authorized.isCurrent()) return;
      if (fixedScope) {
        setLocal({
          key: localKey,
          selection: {
            ...selection!,
            ...patch,
            spaceId,
            statementImportId: fixedScope.statementImportId,
          },
        });
        localScroll.current = { key: localKey, offset: 0 };
      } else updateExpenseBrowse(spaceId, patch);
    },
    [authorized, spaceId, fixedScope, localKey, selection],
  );
  const refresh = useCallback(() => {
    void resource.reload();
  }, [resource]);
  return {
    spaceId,
    refresh,
    selection,
    categories,
    issues,
    queryKey,
    loaded,
    error: state.error,
    deletedOnly,
    phase:
      issues.length > 0
        ? "ready"
        : !loaded && !state.error
          ? "loading"
          : state.error && !loaded
            ? "error"
            : "ready",
    refreshing: state.phase === "refreshing",
    loadingMore: state.phase === "appending",
    spacesLoading,
    spacesRefreshing,
    failure: state.failure,
    refreshSpaces,
    updateSelection,
    readScroll: () =>
      fixedScope
        ? localScroll.current.key === localKey
          ? localScroll.current.offset
          : 0
        : readExpenseScroll(view),
    rememberScroll(offset: number) {
      if (authorized.isCurrent()) {
        if (fixedScope) localScroll.current = { key: localKey, offset };
        else rememberExpenseScroll(offset, view);
      }
    },
    async reload() {
      if (!spaceId || !selection || issues.length) return;
      const success = await resource.reload();
      if (success) {
        if (fixedScope) localScroll.current = { key: localKey, offset: 0 };
        else rememberExpenseScroll(0, view);
      }
    },
    retry: resource.retry,
    loadMore: resource.loadMore,
  };
}
