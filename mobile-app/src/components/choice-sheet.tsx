import { useCallback, useEffect, useRef, type RefObject, type ElementRef, type ReactNode } from 'react';
import { X } from 'lucide-react-native';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { CompactAction } from '@/components/buttons';

type ShellProps = { title: string; visible: boolean; onDismiss: () => void; children: ReactNode; dismissOnBackdrop?: boolean; showClose?: boolean; restoreFocusRef?: RefObject<ElementRef<typeof View> | null>; initialFocusRef?: RefObject<ElementRef<typeof View> | null> };

export function ChoiceSheet(props: ShellProps) {
  return <ModalShell {...props} />;
}

export function CenteredDialog(props: ShellProps) {
  return <ModalShell {...props} centered />;
}

function ModalShell({
  title,
  visible,
  onDismiss,
  children,
  centered = false,
  dismissOnBackdrop = true,
  showClose = false,
  restoreFocusRef,
  initialFocusRef,
}: {
  title: string;
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  centered?: boolean;
  dismissOnBackdrop?: boolean;
  showClose?: boolean;
  restoreFocusRef?: RefObject<ElementRef<typeof View> | null>;
  initialFocusRef?: RefObject<ElementRef<typeof View> | null>;
}) {
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useAppTheme();
  const wasVisible = useRef(visible);
  const titleRef = useRef<ElementRef<typeof Text>>(null);
  const restoreFocus = useCallback(() => {
    if (restoreFocusRef?.current) AccessibilityInfo.sendAccessibilityEvent(restoreFocusRef.current, 'focus');
  }, [restoreFocusRef]);
  useEffect(() => {
    const dismissed = wasVisible.current && !visible;
    wasVisible.current = visible;
    // iOS supplies onDismiss after the native window closes; Android does not.
    if (!dismissed || Platform.OS === 'ios') return;
    const frame = requestAnimationFrame(restoreFocus);
    return () => cancelAnimationFrame(frame);
  }, [visible, restoreFocus]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      onDismiss={restoreFocus}
      onShow={() => {
        if (initialFocusRef?.current) AccessibilityInfo.sendAccessibilityEvent(initialFocusRef.current, 'focus');
        else if (restoreFocusRef && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
      }}
      accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: centered ? 'center' : 'flex-end', paddingTop: insets.top, paddingBottom: centered ? insets.bottom : 0, paddingHorizontal: centered ? space.screenHorizontal : 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={dismissOnBackdrop ? onDismiss : undefined}
          accessible={dismissOnBackdrop}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: palette.scrim,
          }}
        />
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false} style={{ flexGrow: 0, maxHeight: '100%', borderRadius: centered ? radius.dialog : undefined }}>
        <View accessibilityViewIsModal
          style={{
            backgroundColor: palette.surfaceModal,
            borderRadius: centered ? radius.dialog : 0,
            borderTopLeftRadius: centered ? radius.dialog : radius.sheet,
            borderTopRightRadius: centered ? radius.dialog : radius.sheet,
            borderCurve: 'continuous',
            paddingTop: centered ? space.dialogInset : space.sheetPaddingTop,
            paddingHorizontal: space.dialogInset,
            paddingBottom: centered ? space.dialogInset : Math.max(insets.bottom, space.sheetPaddingBottom),
            gap: centered ? space.dialogGap : space.sheetGap,
          }}>
          {showClose && !centered ? <View accessible={false} style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.fieldBorder }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text
            ref={titleRef}
            accessible
            accessibilityRole="header"
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: showClose ? 22 : typeScale.sectionTitle,
              flex: 1,
            }}>
            {title}
          </Text>
          {showClose ? <CompactAction label={`Close ${title}`} variant="icon" icon={<X size={20} color={palette.textSecondary} />} onPress={onDismiss} /> : null}
          </View>
          {children}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
