import { ScreenHeader } from '@/components/screen-header';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CanvasBackground } from '@/components/design-surface';
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
  headerAccessory,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerAccessory?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.canvas }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
    <CanvasBackground />
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brandPrimary} />
        ) : undefined
      }
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.cardGap,
        paddingBottom: insets.bottom + controlSize.navigation + controlSize.addAction,
        paddingHorizontal: space.screenHorizontal,
        gap: space.cardGap,
      }}>
      <ScreenHeader title={title} accessory={headerAccessory} />
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
