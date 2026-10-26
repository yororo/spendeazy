import { useEffect, useMemo, useState } from 'react';

import {
  createStatementImportHistoryApiClient,
  type StatementImportHistoryItem,
} from '@/api/statement-import-history-api-client';
import { requestFailureMessage } from '@/api/request-failure';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';

export function useStatementImportHistory() {
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const api = useMemo(
    () => createStatementImportHistoryApiClient(authorized),
    [authorized],
  );
  const [page, setPage] = useState<{
    spaceId: string;
    items: StatementImportHistoryItem[];
    nextCursor: string | null;
  } | null>(null);
  const [loadedSpaceId, setLoadedSpaceId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    spaceId: string;
    error: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const items = page && page.spaceId === active?.id ? page.items : [];
  const nextCursor = page && page.spaceId === active?.id ? page.nextCursor : null;
  const error = failure && failure.spaceId === active?.id ? failure.error : null;
  const loading = active !== null && (loadedSpaceId !== active.id || refreshing);

  useEffect(() => {
    if (!active?.id) return;
    let current = true;
    void api.list(active.id).then((result) => {
      if (!current) return;
      setPage({
        spaceId: active.id,
        items: result.items,
        nextCursor: result.nextCursor,
      });
      setLoadedSpaceId(active.id);
      setFailure(null);
      setRefreshing(false);
    }).catch((cause: unknown) => {
      if (!current) return;
      setFailure({ spaceId: active.id, error: requestFailureMessage(cause) });
      setLoadedSpaceId(active.id);
      setRefreshing(false);
    });
    return () => { current = false; };
  }, [active?.id, api, requestId]);

  async function loadMore() {
    if (!active?.id || !nextCursor || loading || loadingMore) return;
    const spaceId = active.id;
    setLoadingMore(true);
    setFailure(null);
    try {
      const next = await api.list(spaceId, nextCursor);
      if (!authorized.isCurrent()) return;
      setPage((current) => current?.spaceId === spaceId
        ? {
            spaceId,
            items: [...current.items, ...next.items],
            nextCursor: next.nextCursor,
          }
        : current);
    } catch (cause) {
      if (authorized.isCurrent()) {
        setFailure({ spaceId, error: requestFailureMessage(cause) });
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function refresh() {
    if (!active?.id) return;
    setRefreshing(true);
    setRequestId((current) => current + 1);
  }

  return {
    active,
    items,
    nextCursor,
    error,
    loading,
    refreshing,
    loadingMore,
    loadMore,
    refresh,
  };
}
