import type { StatementImportHistoryItem } from '@/api/statement-import-history-api-client';
import { FileClock, LockKeyhole } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { SecondaryButton } from '@/components/buttons';
import { DesignSurface } from '@/components/design-surface';
import { Screen, StackGap, SupportingText } from '@/components/screen';
import { useAppTheme } from '@/navigation/app-theme';
import type { useStatementImportHistory } from './use-statement-import-history';

export function StatementImportHistoryView({
  controller,
  onBack,
}: {
  controller: ReturnType<typeof useStatementImportHistory>;
  onBack: () => void;
}) {
  const { palette, fonts } = useAppTheme();
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
        <SupportingText>Recorded Statement Imports for this Space.</SupportingText>
        {active?.status === 'archived' ? <DesignSurface style={{ padding: 20, gap: 10 }}><LockKeyhole accessible={false} size={20} color={palette.stateWarning} /><SupportingText>This archived Shared Space is read-only. Its import history is retained.</SupportingText></DesignSurface> : null}
        {(loading || (!error && active)) && items.length === 0 ? <DesignSurface style={{ padding: 22, gap: 14 }}>
          <FileClock accessible={false} size={28} color={palette.brandPrimary} />
          <SupportingText>{loading ? 'Loading Statement Import history.' : 'No Statement Imports have been recorded in this Space.'}</SupportingText>
        </DesignSurface> : null}
        <View>{items.map((item) => <ImportHistoryItem key={item.id} item={item} />)}</View>
        {error ? <Text selectable accessibilityLiveRegion="polite" style={{ color: palette.stateNegative, fontFamily: fonts.regular, fontSize: 16 }}>{error}</Text> : null}
        {nextCursor ? <SecondaryButton label="Load more history" busy={loadingMore} onPress={() => void loadMore()} /> : null}
        <SecondaryButton label="Back" onPress={onBack} />
      </StackGap>
    </Screen>
  );
}

function ImportHistoryItem({ item }: { item: StatementImportHistoryItem }) {
  const { palette, fonts } = useAppTheme();
  const range = item.statementDate ?? (item.historyFromDate && item.historyToDate
    ? `${item.historyFromDate} to ${item.historyToDate}` : 'Date not recorded');
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderColor: palette.divider }}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: palette.selectedSpace, alignItems: 'center', justifyContent: 'center' }}><FileClock size={20} color={palette.brandPrimary} /></View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text selectable style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>{item.fileName}</Text>
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{`${item.provider} · ${item.statementType === 'credit_card' ? 'Credit Card' : 'E-Wallet'}`}</Text>
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{range}</Text>
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{`Imported ${new Date(item.importedAt).toLocaleDateString()} · ${item.expenseCount} Expenses`}</Text>
        {item.totalDebit ? <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 15 }}>{`Total Debit ${item.totalDebit}`}</Text> : null}
      </View>
    </View>
  );
}
