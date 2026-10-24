import { Text } from 'react-native';
import { SecondaryButton } from '@/components/buttons';
import { MoneyAmount } from '@/components/money-amount';
import { Screen, StackGap, SupportingText, BodyText } from '@/components/screen';
import { typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export type ExpenseDetailViewState = {
  phase: 'loading' | 'error' | 'ready';
  error: string | null;
  expense: {
    description: string;
    amount: string;
    expenseDate: string;
    categoryName: string;
    source: 'manual' | 'imported';
    addedByName: string | null;
  } | null;
};

export function ExpenseDetail({ state, onRetry, onBack }: {
  state: ExpenseDetailViewState;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const { phase, error, expense } = state;
  return (
    <Screen title="Expense">
      <StackGap>
        {phase === 'loading' ? <BodyText>Loading Expense.</BodyText> : null}
        {phase === 'error' && error ? (
          <StackGap>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.textPrimary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
              {error}
            </Text>
            <SecondaryButton label="Retry" onPress={onRetry} />
          </StackGap>
        ) : null}
        {phase === 'ready' && expense ? (
          <StackGap>
            <BodyText>{expense.description}</BodyText>
            <MoneyAmount amount={expense.amount} />
            <SupportingText>{expense.expenseDate}</SupportingText>
            <SupportingText>{expense.categoryName}</SupportingText>
            <SupportingText>{expense.source === 'manual' ? 'Cash' : 'Imported'}</SupportingText>
            <SupportingText>
              {expense.addedByName ? `Added By ${expense.addedByName}` : 'Added By is kept with this Expense.'}
            </SupportingText>
          </StackGap>
        ) : null}
        <SecondaryButton label="Back" onPress={onBack} />
      </StackGap>
    </Screen>
  );
}
