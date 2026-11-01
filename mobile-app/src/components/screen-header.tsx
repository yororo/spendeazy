import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function ScreenHeader({ title, accessory, compact = false }: { title: string; accessory?: ReactNode; compact?: boolean }) {
  const { palette, fonts } = useAppTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: compact ? typeScale.sectionTitle : typeScale.pageTitle, letterSpacing: typeScale.pageTitleTracking }}>{title}</Text>{accessory}</View>;
}
