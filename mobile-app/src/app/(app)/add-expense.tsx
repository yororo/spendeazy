import { useRouter } from 'expo-router';

import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap } from '@/components/screen';

export default function AddExpenseScreen() {
  const router = useRouter();
  return (
    <Screen title="Add Expense">
      <StackGap>
        <BodyText>Add Expense is not available yet. Opening this screen has not saved an Expense.</BodyText>
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </StackGap>
    </Screen>
  );
}