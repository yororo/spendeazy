import { useRouter } from 'expo-router';
import { ExpenseBrowse } from '@/features/expenses/browse-view';
import { useExpenseBrowse } from '@/features/expenses/use-expense-browse';
import { SpaceStatus } from '@/components/space-status';

export default function ExpensesScreen() {
  const router = useRouter();
  const controller = useExpenseBrowse();
  return <ExpenseBrowse controller={controller} spaceStatus={<SpaceStatus />} onOpenExpense={(expenseId) => router.push({ pathname: '/expense/[expenseId]', params: { expenseId } })} />;
}
