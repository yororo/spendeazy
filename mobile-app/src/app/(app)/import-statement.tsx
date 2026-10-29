import { useRouter } from 'expo-router';
import { SecondaryButton } from '@/components/buttons';
import { SupportingText } from '@/components/screen';
import { StatementImportView } from '@/features/statement-import/import-view';
import { useStatementImport } from '@/features/statement-import/use-statement-import';
import { useStatementImportReview } from '@/features/statement-import/use-statement-import-review';
import { StatementImportReviewView } from '@/features/statement-import/review-view';
import { ImportHistoryItem } from '@/features/statement-import-history/statement-import-history-view';
import { useStatementImportHistory } from '@/features/statement-import-history/use-statement-import-history';

export default function ImportStatementScreen() {
  const router = useRouter();
  const controller = useStatementImport();
  const review = useStatementImportReview();
  if (review.review && (review.phase === 'review' || review.phase === 'review-ready')) {
    return <StatementImportReviewView controller={review} destination={controller.destination} onBack={() => router.back()}
      onDiscard={() => { controller.discard(); router.back(); }} />;
  }
  return <ImportSelection controller={controller} onBack={() => router.back()} onHistory={() => router.push('/(app)/statement-import-history')} />;
}

function ImportSelection({ controller, onBack, onHistory }: {
  controller: ReturnType<typeof useStatementImport>; onBack(): void; onHistory(): void;
}) {
  const history = useStatementImportHistory();
  return <StatementImportView controller={controller} onBack={onBack}
    onHistory={onHistory}
    recentHistory={<>
      {history.loading ? <SupportingText>Loading recent statements…</SupportingText> : null}
      {history.error ? <><SupportingText>{history.error}</SupportingText><SecondaryButton label="Retry history" onPress={history.refresh} /></> : null}
      {!history.loading && !history.error && history.items.length === 0 ? <SupportingText>No Statement Imports have been recorded in this Space.</SupportingText> : null}
      {history.items.slice(0, 3).map(item => <ImportHistoryItem key={item.id} item={item} />)}
    </>} />;
}
