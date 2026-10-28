import { useRouter } from 'expo-router';
import { FileUp } from 'lucide-react-native';
import { View } from 'react-native';

import { SecondaryButton } from '@/components/buttons';
import { BodyText, Screen, StackGap } from '@/components/screen';
import { DesignSurface } from '@/components/design-surface';
import { space } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export default function ImportStatementScreen() {
  const router = useRouter();
  const { palette } = useAppTheme();
  return (
    <Screen title="Import statement">
      <DesignSurface style={{ padding: space.cardInset }}><StackGap>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: palette.selectedSpace, alignItems: 'center', justifyContent: 'center' }}><FileUp size={26} color={palette.brandPrimary} /></View>
        <BodyText>Import statement is not available yet. Opening this screen has not read a file or saved an Expense.</BodyText>
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </StackGap></DesignSurface>
    </Screen>
  );
}
