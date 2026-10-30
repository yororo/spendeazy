import { useRouter, type Href } from 'expo-router';
import { SecondaryButton } from '@/components/buttons';
import { SupportingText } from '@/components/screen';
import { StatementImportView } from '@/features/statement-import/import-view';
import { useStatementImport } from '@/features/statement-import/use-statement-import';
import { useStatementImportReview } from '@/features/statement-import/use-statement-import-review';
import { StatementImportReviewView } from '@/features/statement-import/review-view';
import { ImportHistoryItem } from '@/features/statement-import-history/statement-import-history-view';
import { useStatementImportHistory } from '@/features/statement-import-history/use-statement-import-history';
import { importDetailPath } from '@/features/statement-import-history/history-navigation';
import { useImportConfirmation } from '@/features/statement-import/use-import-confirmation';
import { ImportConfirmationView } from '@/features/statement-import/confirmation-view';
import { ImportRecoveryView } from '@/features/statement-import/recovery-view';
import { useSpaces } from '@/application/spaces/provider';

export default function ImportStatementScreen() {
  const router = useRouter();
  const controller = useStatementImport();
  const review = useStatementImportReview();
  const confirmation = useImportConfirmation();
  const { active, refresh } = useSpaces();
  if (confirmation.receipt) return <ImportRecoveryView controller={confirmation} destination={controller.destination}
    writable={!controller.readOnly} historyAvailable={active?.id === confirmation.receipt.spaceId}
    onClose={() => router.replace('/(app)/(tabs)')}
    onHistory={() => router.replace('/(app)/statement-import-history')}
    onAcknowledged={() => { confirmation.back(); void refresh(); }} />;
  if (review.phase === 'review-ready') {
    return <ImportConfirmationView controller={confirmation} destination={controller.destination} readOnly={controller.readOnly}
      onDiscard={() => { controller.discard(); router.back(); }} />;
  }
  if (review.review && review.phase === 'review') {
    return <StatementImportReviewView controller={review} destination={controller.destination} onBack={() => router.back()}
      onDiscard={() => { controller.discard(); router.back(); }} />;
  }
  return <ImportSelection controller={controller} onBack={() => router.back()} onHistory={() => router.push('/(app)/statement-import-history')} />;
}

function ImportSelection({ controller, onBack, onHistory }: {
  controller: ReturnType<typeof useStatementImport>; onBack(): void; onHistory(): void;
}) {
  const history = useStatementImportHistory({}, 3);
  const router = useRouter();
  return <StatementImportView controller={controller} onBack={onBack}
    onHistory={onHistory}
    recentHistory={<>
      {history.loading ? <SupportingText>Loading recent statements…</SupportingText> : null}
      {history.error ? <><SupportingText>{history.error}</SupportingText><SecondaryButton label="Retry history" onPress={history.refresh} /></> : null}
      {!history.loading && !history.error && history.items.length === 0 ? <SupportingText>No Statement Imports have been recorded in this Space.</SupportingText> : null}
      {history.items.slice(0, 3).map(item => <ImportHistoryItem key={item.id} item={item} importer={history.importerName(item.importedByUserId)} onPress={() => {
        if (history.active) router.push(importDetailPath(history.active.id, item.id) as Href);
      }} />)}
    </>} />;
}
