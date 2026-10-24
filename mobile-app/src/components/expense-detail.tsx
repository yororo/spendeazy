import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ExpenseApiError, ExpenseApiTransportError } from '@/api/authorized-request';
import { createExpenseApiClient } from '@/api/expense-api-client';
import { SecondaryButton } from '@/components/buttons';
import { MoneyAmount } from '@/components/money-amount';
import { BodyText, Screen, StackGap, SupportingText } from '@/components/screen';
import { useAuthorizedClient } from '@/navigation/authorized-client';
import { readListedExpense, type ListedExpense } from '@/navigation/expense-browse';
import { useSpaceCategories } from '@/navigation/use-space-categories';
import { useSpaces } from '@/navigation/spaces-provider';

export function ExpenseDetail({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const { active } = useSpaces();
  const authorized = useAuthorizedClient();
  const categories = useSpaceCategories(active?.id ?? null);
  const [requestId, setRequestId] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    expense: ListedExpense | null;
    error: string | null;
  } | null>(null);
  const requestKey = `${active?.id ?? ''}:${expenseId}:${requestId}`;

  useEffect(() => {
    if (!active) return;
    let current = true;
    const key = `${active.id}:${expenseId}:${requestId}`;
    createExpenseApiClient(authorized)
      .getExpense(active.id, expenseId)
      .then((payload) => {
        if (!current) return;
        setResult({ key, expense: readListedExpense(payload), error: null });
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setResult({ key, expense: null, error: detailLoadMessage(cause) });
      });
    return () => {
      current = false;
    };
  }, [active, authorized, expenseId, requestId]);

  const current = result?.key === requestKey ? result : null;
  const expense = current?.expense ?? null;
  const error = current?.error ?? null;
  const phase = !active || current === null ? 'loading' : error ? 'error' : 'ready';

  const category = categories.categories.find((item) => item.id === expense?.categoryId);
  const addedBy = active?.members.find((member) => member.id === expense?.addedByUserId);

  return (
    <Screen title="Expense">
      <StackGap>
        {phase === 'loading' ? <BodyText>Loading Expense.</BodyText> : null}
        {error ? (
          <StackGap>
            <BodyText>{error}</BodyText>
            <SecondaryButton label="Retry" onPress={() => setRequestId((current) => current + 1)} />
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
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </StackGap>
    </Screen>
  );
}

function detailLoadMessage(cause: unknown): string {
  if (cause instanceof ExpenseApiError || cause instanceof ExpenseApiTransportError) return cause.message;
  return 'This Expense could not be loaded. Try again.';
}
