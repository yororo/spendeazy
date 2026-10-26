import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { createStatementImportHistoryApiClient, type StatementImportHistoryItem } from '@/api/statement-import-history-api-client';
import { requestFailureMessage } from '@/api/request-failure';
import { useAuthorizedClient } from '@/application/authorized-client';
import { useSpaces } from '@/application/spaces/provider';
import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';

export default function StatementImportHistoryScreen() {
  const router = useRouter();
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const api = useMemo(() => createStatementImportHistoryApiClient(authorized), [authorized]);
  const [page, setPage] = useState<{ spaceId: string; items: StatementImportHistoryItem[]; nextCursor: string | null } | null>(null);
  const [loadedSpaceId, setLoadedSpaceId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ spaceId: string; error: string } | null>(null);
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
    void api.list(active.id).then((page) => {
      if (!current) return;
      setPage({ spaceId: active.id, items: page.items, nextCursor: page.nextCursor });
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
        ? { spaceId, items: [...current.items, ...next.items], nextCursor: next.nextCursor }
        : current);
    } catch (cause) {
      if (authorized.isCurrent()) setFailure({ spaceId, error: requestFailureMessage(cause) });
    } finally {
      setLoadingMore(false);
    }
  }

  function refresh() {
    if (!active?.id) return;
    setRefreshing(true);
    setRequestId((current) => current + 1);
  }

  return (
    <Screen title="Statement Import history" refreshing={refreshing} onRefresh={refresh}>
      <StackGap>
        {active?.status === 'archived' ? <SupportingText>This archived Shared Space is read-only. Its import history is retained.</SupportingText> : null}
        {loading && items.length === 0 ? <BodyText>Loading Statement Import history.</BodyText> : null}
        {!loading && items.length === 0 && !error && active ? <SupportingText>No Statement Imports have been recorded in this Space.</SupportingText> : null}
        {items.map((item) => <ImportHistoryItem key={item.id} item={item} />)}
        {error ? <BodyText>{error}</BodyText> : null}
        {nextCursor ? <SecondaryButton label="Load more history" busy={loadingMore} onPress={() => void loadMore()} /> : null}
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </StackGap>
    </Screen>
  );
}

function ImportHistoryItem({ item }: { item: StatementImportHistoryItem }) {
  const range = item.statementDate ?? (item.historyFromDate && item.historyToDate
    ? `${item.historyFromDate} to ${item.historyToDate}` : 'Date not recorded');
  return (
    <StackGap>
      <BodyText>{item.fileName}</BodyText>
      <SupportingText>{`${item.provider} · ${item.statementType === 'credit_card' ? 'Credit Card' : 'E-Wallet'}`}</SupportingText>
      <SupportingText>{range}</SupportingText>
      <SupportingText>{`Imported ${new Date(item.importedAt).toLocaleDateString()} · ${item.expenseCount} Expenses`}</SupportingText>
      {item.totalDebit ? <SupportingText>{`Total Debit ${item.totalDebit}`}</SupportingText> : null}
    </StackGap>
  );
}
