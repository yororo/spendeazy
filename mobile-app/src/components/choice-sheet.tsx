import { type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

export function ChoiceSheet({
  title,
  visible,
  onDismiss,
  children,
}: {
  title: string;
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      accessibilityViewIsModal>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: palette.scrim,
          }}
        />
        <View
          style={{
            backgroundColor: palette.surfaceModal,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            borderCurve: 'continuous',
            paddingTop: space.sheetPaddingTop,
            paddingHorizontal: space.dialogInset,
            paddingBottom: Math.max(insets.bottom, space.sheetPaddingBottom),
            gap: space.sheetGap,
          }}>
          <Text
            accessibilityRole="header"
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: typeScale.sectionTitle,
            }}>
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
