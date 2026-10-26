import { useRouter } from 'expo-router';

import { StatementImportHistoryView } from '@/features/statement-import-history/statement-import-history-view';
import { useStatementImportHistory } from '@/features/statement-import-history/use-statement-import-history';

export default function StatementImportHistoryScreen() {
  const router = useRouter();
  const controller = useStatementImportHistory();
  return <StatementImportHistoryView controller={controller} onBack={() => router.back()} />;
}
