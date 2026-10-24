import { type ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.canvas }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brandPrimary} />
        ) : undefined
      }
      style={{ flex: 1, backgroundColor: palette.canvas }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.cardGap,
        paddingBottom: insets.bottom + controlSize.navigation + controlSize.addAction,
        paddingHorizontal: space.screenHorizontal,
        gap: space.cardGap,
      }}>
      <Text
        accessibilityRole="header"
        selectable
        style={{
          color: palette.textPrimary,
          fontFamily: fonts.semibold,
          fontSize: typeScale.pageTitle,
          letterSpacing: typeScale.pageTitleTracking,
        }}>
        {title}
      </Text>
      {children}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function BodyText({ children }: { children: string }) {
  const { palette, fonts } = useAppTheme();
  return (
    <Text selectable style={{ color: palette.textPrimary, fontFamily: fonts.regular, fontSize: typeScale.body }}>
      {children}
    </Text>
  );
}

export function SupportingText({ children }: { children: string }) {
  const { palette, fonts } = useAppTheme();
  return (
    <Text selectable style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.sectionTitle }}>
      {children}
    </Text>
  );
}

export function StackGap({ children }: { children: ReactNode }) {
  return <View style={{ gap: space.cardGap }}>{children}</View>;
}
