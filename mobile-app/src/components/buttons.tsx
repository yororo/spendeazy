import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { controlSize, radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: controlSize.primaryAction,
        minWidth: controlSize.minimumTarget,
        borderRadius: radius.control,
        borderCurve: 'continuous',
        backgroundColor: palette.brandPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.screenBottom,
        paddingVertical: space.sheetPaddingTop,
        opacity: disabled || busy ? 0.55 : 1,
      }}>
      <Text
        style={{
          color: palette.onBrand,
          fontFamily: fonts.semibold,
          fontSize: typeScale.button,
          textAlign: 'center',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  selected = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: controlSize.primaryAction,
        minWidth: controlSize.minimumTarget,
        borderRadius: radius.control,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: selected ? palette.brandPrimary : palette.fieldBorder,
        backgroundColor: palette.surfaceModal,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.screenBottom,
        paddingVertical: space.sheetPaddingTop,
        opacity: disabled || busy ? 0.55 : 1,
      }}>
      <Text
        style={{
          color: selected ? palette.brandPrimary : palette.textPrimary,
          fontFamily: fonts.semibold,
          fontSize: typeScale.button,
          textAlign: 'center',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CompactAction({ label, onPress, icon, selected = false, disabled = false, busy = false, variant = 'chip' }: {
  label: string; onPress: () => void; icon?: ReactNode; selected?: boolean; disabled?: boolean; busy?: boolean; variant?: 'chip' | 'icon' | 'segmented' | 'quiet';
}) {
  const { palette, fonts } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled || busy ? 0.55 : 1 }}>
    <View pointerEvents="none" style={{ minHeight: 36, minWidth: 36, paddingHorizontal: variant === 'icon' ? 0 : 12, paddingVertical: 7, borderRadius: variant === 'chip' ? 18 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: variant === 'quiet' ? 'transparent' : selected ? palette.brandPrimary + '18' : palette.surfaceModal, borderWidth: variant === 'quiet' ? 0 : 1, borderColor: selected ? palette.brandPrimary : palette.fieldBorder }}>
      {icon ? <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</View> : null}
      {variant !== 'icon' ? <Text style={{ color: selected ? palette.brandPrimary : palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.button, textAlign: 'center' }}>{label}</Text> : null}
    </View>
  </Pressable>;
}
