import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { StatementImportHistoryView } from '@/features/statement-import-history/statement-import-history-view';
import { useStatementImportHistory } from '@/features/statement-import-history/use-statement-import-history';
import { importDetailPath } from '@/features/statement-import-history/history-navigation';

export default function StatementImportHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const controller = useStatementImportHistory(params);
  return <StatementImportHistoryView controller={controller} onBack={() => router.back()}
    onOpenImport={(sourceSpaceId, statementImportId) => router.push(importDetailPath(sourceSpaceId, statementImportId) as Href)} />;
}
