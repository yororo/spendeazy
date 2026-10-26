import type { StatementImportHistoryItem } from '@/api/statement-import-history-api-client';
import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import type { useStatementImportHistory } from './use-statement-import-history';

export function StatementImportHistoryView({
  controller,
  onBack,
}: {
  controller: ReturnType<typeof useStatementImportHistory>;
  onBack: () => void;
}) {
  const {
    active,
    items,
    nextCursor,
    error,
    loading,
    refreshing,
    loadingMore,
    loadMore,
    refresh,
  } = controller;

  return (
    <Screen title="Statement Import history" refreshing={refreshing} onRefresh={refresh}>
      <StackGap>
        {active?.status === 'archived' ? <SupportingText>This archived Shared Space is read-only. Its import history is retained.</SupportingText> : null}
        {loading && items.length === 0 ? <BodyText>Loading Statement Import history.</BodyText> : null}
        {!loading && items.length === 0 && !error && active ? <SupportingText>No Statement Imports have been recorded in this Space.</SupportingText> : null}
        {items.map((item) => <ImportHistoryItem key={item.id} item={item} />)}
        {error ? <BodyText>{error}</BodyText> : null}
        {nextCursor ? <SecondaryButton label="Load more history" busy={loadingMore} onPress={() => void loadMore()} /> : null}
        <SecondaryButton label="Back" onPress={onBack} />
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
