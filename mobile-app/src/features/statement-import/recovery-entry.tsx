import { usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SecondaryButton } from '@/components/buttons';
import { useAppTheme } from '@/navigation/app-theme';
import { useImportConfirmation } from './use-import-confirmation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function ImportRecoveryEntry() {
  const c = useImportConfirmation();
  const path = usePathname();
  const router = useRouter();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!c.receipt || path.includes('import-statement')) return null;
  return <View style={{ backgroundColor: palette.canvas, paddingHorizontal: 20, paddingTop: insets.top }}>
    <SecondaryButton label="Check import status" onPress={() => router.push('/(app)/import-statement')} />
  </View>;
}
