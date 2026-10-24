import { SecondaryButton } from '@/components/buttons';
import { MoneyAmount } from '@/components/money-amount';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import type { useExpenseDetail } from './use-expense-detail';

export function ExpenseDetail({ controller, onBack }: { controller: ReturnType<typeof useExpenseDetail>; onBack: () => void }) {
  const { expense, error, phase, category, addedBy, retry } = controller;
  return (
    <Screen title="Expense">
      <StackGap>
        {phase === 'loading' ? <BodyText>Loading Expense.</BodyText> : null}
        {error ? (
          <StackGap>
            <BodyText>{error}</BodyText>
            <SecondaryButton label="Retry" onPress={retry} />
          </StackGap>
        ) : null}
        {expense ? (
          <StackGap>
            <BodyText>{expense.description}</BodyText>
            <MoneyAmount amount={expense.amount} />
            <SupportingText>{expense.expenseDate}</SupportingText>
            <SupportingText>{category?.name ?? 'Category'}</SupportingText>
            <SupportingText>
              {expense.source === 'manual' ? 'Cash' : 'Imported'}
            </SupportingText>
            <SupportingText>
              {addedBy ? `Added By ${addedBy.name}` : 'Added By is kept with this Expense.'}
            </SupportingText>
          </StackGap>
        ) : null}
        <SecondaryButton label="Back" onPress={() => onBack()} />
      </StackGap>
    </Screen>
  );
}
