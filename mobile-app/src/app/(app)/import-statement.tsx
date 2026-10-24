import { useRouter } from 'expo-router';

import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap } from '@/components/screen';

export default function ImportStatementScreen() {
  const router = useRouter();
  return (
    <Screen title="Import statement">
      <StackGap>
        <BodyText>Import statement is not available yet. Opening this screen has not read a file or saved an Expense.</BodyText>
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </StackGap>
    </Screen>
  );
}
