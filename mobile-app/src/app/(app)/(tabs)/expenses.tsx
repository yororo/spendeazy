import { useRouter } from 'expo-router';
import { ExpenseBrowse } from '@/features/expenses/browse-view';
import { useExpenseBrowse } from '@/features/expenses/use-expense-browse';

export default function ExpensesScreen() {
  const router = useRouter();
  const controller = useExpenseBrowse();
  return <ExpenseBrowse controller={controller} onOpenExpense={(expenseId) => router.push({ pathname: '/expense/[expenseId]', params: { expenseId } })} />;
}
