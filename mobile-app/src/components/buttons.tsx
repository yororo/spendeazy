import { Pressable, Text } from 'react-native';

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
