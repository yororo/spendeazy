import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/buttons';
import { ChoiceSheet } from '@/components/choice-sheet';

export default function AddScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ChoiceSheet title="Add" visible onDismiss={() => router.back()}>
        <PrimaryButton label="Import statement" onPress={() => router.push('/import-statement')} />
        <SecondaryButton label="Add Expense" onPress={() => router.push('/add-expense')} />
      </ChoiceSheet>
    </View>
  );
}
