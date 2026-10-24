import { Text, TextInput, View } from 'react-native';

import { controlSize, radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function TextField({
  label,
  value,
  onChangeText,
  error = null,
  placeholder,
  keyboardType = 'default',
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  onBlur?: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <View style={{ gap: space.fieldLabelGap }}>
      <Text
        style={{
          color: palette.textSecondary,
          fontFamily: fonts.semibold,
          fontSize: typeScale.sectionTitle,
        }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSecondary}
        keyboardType={keyboardType}
        onBlur={onBlur}
        autoCapitalize="sentences"
        autoCorrect={false}
        style={{
          minHeight: controlSize.field,
          borderWidth: 1,
          borderColor: error ? palette.stateNegative : palette.fieldBorder,
          borderRadius: radius.control,
          borderCurve: 'continuous',
          color: palette.textPrimary,
          backgroundColor: palette.surfaceModal,
          fontFamily: fonts.regular,
          fontSize: typeScale.body,
          paddingHorizontal: space.screenBottom,
        }}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: palette.stateNegative,
            fontFamily: fonts.regular,
            fontSize: typeScale.body,
          }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
