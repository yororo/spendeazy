import type {
  StatementImportHistoryPage,
  StatementImportHistoryQuery,
} from "../../api/statement-import-history-api-client.ts";
import { date } from "../../api/statement-import-detail-response.ts";
import { requestFailureMessage } from "../../api/request-failure.ts";

export type HistoryFilters = { fromDate: string; toDate: string };
export const ALL_DATES: HistoryFilters = { fromDate: "", toDate: "" };
export function filterError(filters: HistoryFilters): string | null {
  try {
    if (filters.fromDate) date(filters.fromDate);
    if (filters.toDate) date(filters.toDate);
  } catch {
    return "Enter valid confirmation dates as YYYY-MM-DD.";
  }
  return filters.fromDate && filters.toDate && filters.fromDate > filters.toDate
    ? "From must be on or before To."
    : null;
}
export function routeHistoryFilters(
  params: { sourceSpaceId?: unknown; fromDate?: unknown; toDate?: unknown },
  spaceId: string | null,
): HistoryFilters {
  if (!spaceId || params.sourceSpaceId !== spaceId) return ALL_DATES;
  if (
    (params.fromDate !== undefined && typeof params.fromDate !== "string") ||
    (params.toDate !== undefined && typeof params.toDate !== "string")
  )
    return ALL_DATES;
  const filters = {
    fromDate: params.fromDate ?? "",
    toDate: params.toDate ?? "",
  } as HistoryFilters;
  return filterError(filters) ? ALL_DATES : filters;
}
type State = {
  page: StatementImportHistoryPage | null;
  error: string | null;
  operation: { id: number; kind: "replace" | "append" } | null;
  retryKind: "replace" | "append";
};
type Event =
  | { type: "start"; id: number; kind: "replace" | "append" }
  | { type: "success"; id: number; page: StatementImportHistoryPage }
  | { type: "failure"; id: number; error: string }
  | { type: "cancel" };
function reducer(state: State, event: Event): State {
  if (event.type === "start")
    return {
      ...state,
      error: null,
      operation: { id: event.id, kind: event.kind },
      retryKind: event.kind,
    };
  if (event.type === "cancel") return { ...state, operation: null };
  if (state.operation?.id !== event.id) return state;
  if (event.type === "failure")
    return { ...state, operation: null, error: event.error };
  const items =
    state.operation.kind === "append"
      ? [...(state.page?.items ?? []), ...event.page.items]
      : event.page.items;
  return {
    ...state,
    page: { ...event.page, items },
    error: null,
    operation: null,
  };
}
/** Each instance owns one identity generation, Space and normalized query lifetime. */
export function createHistoryWorkflow(
  spaceId: string | null,
  filters: HistoryFilters,
  isCurrent: () => boolean,
  list: (
    spaceId: string,
    query: StatementImportHistoryQuery,
  ) => Promise<StatementImportHistoryPage>,
  pageSize = 100,
) {
  const empty: State = {
    page: null,
    error: null,
    operation: null,
    retryKind: "replace",
  };
  let state = empty,
    nextId = 0;
  const listeners = new Set<() => void>();
  function dispatch(event: Event) {
    state = reducer(state, event);
    for (const listener of listeners) listener();
  }
  async function load(kind: "replace" | "append") {
    if (!spaceId || !isCurrent() || filterError(filters)) return;
    if (kind === "append" && (state.operation || !state.page?.nextCursor))
      return;
    const cursor = kind === "append" ? state.page!.nextCursor! : undefined;
    const id = ++nextId;
    dispatch({ type: "start", id, kind });
    try {
      const page = await list(spaceId, {
        ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
        ...(filters.toDate ? { toDate: filters.toDate } : {}),
        ...(cursor ? { cursor } : {}),
        pageSize,
      });
      if (isCurrent()) dispatch({ type: "success", id, page });
    } catch (cause) {
      if (isCurrent())
        dispatch({ type: "failure", id, error: requestFailureMessage(cause) });
    }
  }
  return {
    snapshot: () => (isCurrent() ? state : empty),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel() {
      dispatch({ type: "cancel" });
    },
    refresh: () => load("replace"),
    retry: () => load(state.retryKind),
    loadMore: () => load("append"),
  };
}
