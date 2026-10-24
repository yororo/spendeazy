import { useRouter } from 'expo-router';
import { ManualExpenseForm } from '@/features/expenses/manual-view';
import { useManualExpense } from '@/features/expenses/use-manual-expense';

export default function AddExpenseScreen() {
  const router = useRouter();
  const controller = useManualExpense();
  return <ManualExpenseForm
    state={controller.state}
    onChange={controller.update}
    onRetryCategories={controller.retryCategories}
    onBack={() => router.back()}
    onSave={() => void controller.save().then((saved) => {
      if (saved && controller.isCurrent()) router.back();
    })}
  />;
}
