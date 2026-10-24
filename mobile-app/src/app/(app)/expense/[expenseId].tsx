import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExpenseDetail } from '@/features/expenses/detail-view';
import { useExpenseDetail } from '@/features/expenses/use-expense-detail';
import { BodyText, Screen } from '@/components/screen';

export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  if (typeof expenseId !== 'string' || expenseId.length === 0) {
    return <Screen title="Expense"><BodyText>This Expense could not be opened.</BodyText></Screen>;
  }
  return <ExpenseDetailContainer expenseId={expenseId} />;
}

function ExpenseDetailContainer({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const controller = useExpenseDetail(expenseId);
  return <ExpenseDetail state={controller.state} onRetry={() => { void controller.retry(); }} onBack={() => router.back()} />;
}
