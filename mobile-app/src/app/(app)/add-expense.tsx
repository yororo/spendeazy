import { useRouter } from 'expo-router';
import { ManualExpenseForm } from '@/features/expenses/manual-view';
import { useManualExpense } from '@/features/expenses/use-manual-expense';

export default function AddExpenseScreen() {
  const router = useRouter();
  const controller = useManualExpense();
  return <ManualExpenseForm controller={controller} onBack={() => router.back()} onSaved={() => router.back()} />;
}
