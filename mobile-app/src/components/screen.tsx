import { PullRefreshControl } from '@/components/pull-refresh-control';
import { ScreenHeader } from '@/components/screen-header';
import { type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
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
  compactHeader = false,
  onBack,
  backDisabled,
  scrollRef,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerAccessory?: ReactNode;
  compactHeader?: boolean;
  onBack?: () => void;
  backDisabled?: boolean;
  scrollRef?: Ref<React.ComponentRef<typeof ScrollView>>;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.canvas }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
    <CanvasBackground />
    <ScrollView
      ref={scrollRef}
      // Safe-area padding below owns the insets; iOS must not add them again.
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <PullRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brandPrimary} />
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
      <ScreenHeader title={title} accessory={headerAccessory} compact={compactHeader} onBack={onBack} backDisabled={backDisabled} />
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
