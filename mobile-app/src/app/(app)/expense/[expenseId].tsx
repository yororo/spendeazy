import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetail } from '@/components/expense-detail';
import { BodyText, Screen } from '@/components/screen';

export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  if (typeof expenseId !== 'string' || expenseId.length === 0) {
    return (
      <Screen title="Expense">
        <BodyText>This Expense could not be opened.</BodyText>
      </Screen>
    );
  }
  return <ExpenseDetail expenseId={expenseId} />;
}
