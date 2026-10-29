import type { ReactNode } from 'react';
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
  autoCapitalize = 'sentences',
  onBlur,
  editable = true,
  variant = 'filled',
  icon,
  showLabel = true,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onBlur?: () => void;
  editable?: boolean;
  variant?: 'filled' | 'underlined' | 'amount' | 'budget';
  icon?: ReactNode;
  showLabel?: boolean;
  suffix?: string;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <View style={{ gap: space.fieldLabelGap }}>
      {showLabel ? <Text
        style={{
          color: palette.textSecondary,
          fontFamily: fonts.semibold,
          fontSize: typeScale.sectionTitle,
        }}>
        {label}
      </Text> : null}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        borderBottomWidth: variant === 'underlined' ? 1 : 0,
        borderWidth: variant === 'budget' && error ? 1 : 0,
        borderColor: error ? palette.stateNegative : palette.fieldBorder,
        backgroundColor: variant === 'budget' ? palette.editorField : undefined,
        borderRadius: variant === 'budget' ? radius.control : undefined,
      }}>
      {icon ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</View> : null}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textSecondary}
        keyboardType={keyboardType}
        onBlur={onBlur}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{
          flex: 1,
          minHeight: controlSize.field,
          borderWidth: variant === 'filled' ? 1 : 0,
          borderColor: error ? palette.stateNegative : palette.fieldBorder,
          borderRadius: variant === 'filled' || variant === 'budget' ? radius.control : 0,
          borderCurve: 'continuous',
          color: palette.textPrimary,
          backgroundColor: variant === 'filled' ? palette.surfaceModal : 'transparent',
          opacity: editable ? 1 : 0.55,
          fontFamily: variant === 'filled' ? fonts.regular : fonts.medium,
          fontSize: variant === 'amount' ? 48 : variant === 'budget' ? typeScale.budgetAmount : typeScale.body,
          letterSpacing: variant === 'amount' ? -1.5 : 0,
          textAlign: variant === 'amount' ? 'center' : 'left',
          paddingHorizontal: variant === 'filled' ? space.screenBottom : variant === 'budget' ? 20 : 0,
          paddingVertical: variant === 'budget' ? 20 : undefined,
        }}
      />
      {suffix ? <Text style={{ paddingRight: 20, color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>{suffix}</Text> : null}
      </View>
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
