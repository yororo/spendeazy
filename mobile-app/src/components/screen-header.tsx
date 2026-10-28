import type { ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function ScreenHeader({ title, accessory, showBrand = true }: { title: string; accessory?: ReactNode; showBrand?: boolean }) {
  const { palette, fonts } = useAppTheme();
  return <View style={{ gap: 18 }}>
    {showBrand ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Image source={require('../../assets/design/oV7Mn.png')} accessible={false} style={{ width: 30, height: 34 }} /><Text style={{ color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: 18 }}>spendeazy</Text></View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.textPrimary, fontFamily: fonts.semibold, fontSize: typeScale.pageTitle, letterSpacing: typeScale.pageTitleTracking }}>{title}</Text>{accessory}</View>
  </View>;
}
