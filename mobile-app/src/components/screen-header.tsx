import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function ScreenHeader({ title, accessory, compact = false, onBack, backDisabled = false }: { title: string; accessory?: ReactNode; compact?: boolean; onBack?: () => void; backDisabled?: boolean }) {
  const { palette, fonts } = useAppTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={onBack} hitSlop={4} style={{ minWidth: 48, minHeight: 48, marginLeft: -12, alignItems: 'center', justifyContent: 'center', opacity: backDisabled ? 0.55 : 1 }}>
        <ChevronLeft color={palette.textPrimary} size={26} />
      </Pressable> : null}
      <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: compact ? 22 : typeScale.pageTitle, letterSpacing: compact ? undefined : typeScale.pageTitleTracking }}>{title}</Text>
    </View>
    {accessory ? <View style={{ flexShrink: 0, alignItems: 'flex-end', maxWidth: '50%' }}>{accessory}</View> : null}
  </View>;
}
