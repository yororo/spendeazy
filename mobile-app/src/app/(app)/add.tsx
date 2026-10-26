import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';
import { BodyText } from '@/components/screen';
import { useSpaces } from '@/application/spaces/provider';

export default function AddScreen() {
  const router = useRouter();
  const { active } = useSpaces();
  const writable = active?.status === 'active' && active.accessLevel === 'write';
  return (
    <View style={{ flex: 1 }}>
      <ChoiceSheet title="Add" visible onDismiss={() => router.back()}>
        {writable ? (
          <>
            <PrimaryButton label="Import statement" onPress={() => router.push('/import-statement')} />
            <SecondaryButton label="Add Expense" onPress={() => router.push('/add-expense')} />
          </>
        ) : (
          <BodyText>This Space is read-only. Its existing Expenses and import history remain available.</BodyText>
        )}
      </ChoiceSheet>
    </View>
  );
}
