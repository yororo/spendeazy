import { useRouter } from 'expo-router';
import { SecondaryButton } from '@/components/buttons';
import { SupportingText } from '@/components/screen';
import { StatementImportView } from '@/features/statement-import/import-view';
import { useStatementImport } from '@/features/statement-import/use-statement-import';
import { ImportHistoryItem } from '@/features/statement-import-history/statement-import-history-view';
import { useStatementImportHistory } from '@/features/statement-import-history/use-statement-import-history';

export default function ImportStatementScreen() {
  const router = useRouter();
  const controller = useStatementImport();
  const history = useStatementImportHistory();
  return <StatementImportView controller={controller} onBack={() => router.back()}
    onHistory={() => router.push('/(app)/statement-import-history')}
    recentHistory={<>
      {history.loading ? <SupportingText>Loading recent statements…</SupportingText> : null}
      {history.error ? <><SupportingText>{history.error}</SupportingText><SecondaryButton label="Retry history" onPress={history.refresh} /></> : null}
      {!history.loading && !history.error && history.items.length === 0 ? <SupportingText>No Statement Imports have been recorded in this Space.</SupportingText> : null}
      {history.items.slice(0, 3).map(item => <ImportHistoryItem key={item.id} item={item} />)}
    </>} />;
}
