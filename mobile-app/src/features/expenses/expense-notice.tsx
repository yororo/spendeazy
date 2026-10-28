import { CloudOff, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { useAppTheme } from '@/navigation/app-theme';

export function ExpenseNotice({ message, warning = false }: { message: string; warning?: boolean }) {
  const { palette, fonts } = useAppTheme();
  const Icon = warning ? TriangleAlert : CloudOff;
  const color = warning ? palette.stateWarning : palette.stateNegative;
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 12 }}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '18' }}>
        <Icon size={30} color={color} />
      </View>
      <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  );
}
