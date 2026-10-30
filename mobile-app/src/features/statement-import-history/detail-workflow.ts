import type { StatementImportDetail } from "../../api/statement-import-history-api-client.ts";
import {
  ExpenseApiError,
  requestFailureMessage,
} from "../../api/request-failure.ts";

export function importRouteScope(
  route: { sourceSpaceId?: unknown; statementImportId?: unknown },
  activeSpaceId: string | null,
) {
  const { sourceSpaceId, statementImportId } = route;
  return typeof sourceSpaceId === "string" &&
    /^[1-9]\d*$/.test(sourceSpaceId) &&
    typeof statementImportId === "string" &&
    /^[1-9]\d*$/.test(statementImportId) &&
    sourceSpaceId === activeSpaceId
    ? { sourceSpaceId, statementImportId }
    : null;
}

type State = {
  detail: StatementImportDetail | null;
  loading: boolean;
  error: string | null;
  unavailable: boolean;
};
type Event =
  | { type: "started" }
  | { type: "loaded"; detail: StatementImportDetail }
  | { type: "failed"; error: string; unavailable: boolean };
function reducer(state: State, event: Event): State {
  if (event.type === "started")
    return { ...state, loading: true, error: null, unavailable: false };
  if (event.type === "loaded")
    return {
      detail: event.detail,
      loading: false,
      error: null,
      unavailable: false,
    };
  return {
    detail: null,
    loading: false,
    error: event.error,
    unavailable: event.unavailable,
  };
}

/** One authorized identity/Space/import lifetime; replacement reads supersede earlier reads. */
export function createImportDetailWorkflow(
  isCurrent: () => boolean,
  read: () => Promise<StatementImportDetail>,
) {
  const empty: State = {
    detail: null,
    loading: false,
    error: null,
    unavailable: false,
  };
  let state = empty;
  let operation = 0;
  const listeners = new Set<() => void>();
  function dispatch(event: Event) {
    state = reducer(state, event);
    for (const listener of listeners) listener();
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
      operation++;
    },
    async refresh() {
      if (!isCurrent()) return;
      const id = ++operation;
      dispatch({ type: "started" });
      try {
        const detail = await read();
        if (id === operation && isCurrent())
          dispatch({ type: "loaded", detail });
      } catch (cause) {
        if (id === operation && isCurrent())
          dispatch({
            type: "failed",
            error: requestFailureMessage(cause),
            unavailable:
              cause instanceof ExpenseApiError &&
              [403, 404].includes(cause.status),
          });
      }
    },
  };
}
