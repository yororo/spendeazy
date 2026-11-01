import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ElementRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompactAction } from '@/components/buttons';
import { controlSize, radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

type Anchor = { x: number; y: number; width: number; height: number };

/** Small trigger-adjacent choices. The Add route already owns its modal window. */
export function Popover({ title, visible, onDismiss, children, anchorRef, presentation = 'modal', restoreFocusOnDismiss = true, showHeader = true, width: preferredWidth = 300 }: {
  title: string;
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  anchorRef?: RefObject<ElementRef<typeof View> | null>;
  presentation?: 'modal' | 'inline';
  restoreFocusOnDismiss?: boolean;
  showHeader?: boolean;
  width?: number;
}) {
  const { palette, fonts } = useAppTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  if (!visible && anchor !== null) setAnchor(null);
  const titleRef = useRef<ElementRef<typeof Text>>(null);
  const wasVisible = useRef(false);
  const restoreFocus = useCallback(() => {
    if (restoreFocusOnDismiss && anchorRef?.current) AccessibilityInfo.sendAccessibilityEvent(anchorRef.current, 'focus');
  }, [anchorRef, restoreFocusOnDismiss]);
  const focusTitle = useCallback(() => {
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, []);

  useLayoutEffect(() => {
    if (!visible || !anchorRef) return;
    let current = true;
    anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
      if (current) setAnchor({ x, y, width: anchorWidth, height: anchorHeight });
    });
    return () => { current = false; };
  }, [visible, anchorRef, width, height]);

  useEffect(() => {
    const dismissed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (!dismissed || (presentation === 'modal' && Platform.OS === 'ios')) return;
    const frame = requestAnimationFrame(restoreFocus);
    return () => cancelAnimationFrame(frame);
  }, [visible, presentation, restoreFocus]);

  const margin = 16;
  const gap = 8;
  const popoverWidth = Math.min(preferredWidth * fontScale, width - margin * 2);
  const topEdge = insets.top + gap;
  const bottomEdge = height - insets.bottom - gap;
  const below = anchor ? Math.max(0, bottomEdge - anchor.y - anchor.height - gap) : 0;
  const above = anchor ? Math.max(0, anchor.y - gap - topEdge) : 0;
  const openAbove = above > below && below < 260 * fontScale;
  const left = anchor
    ? Math.max(margin, Math.min(anchor.x + anchor.width - popoverWidth, width - margin - popoverWidth))
    : width - space.screenHorizontal - popoverWidth;
  const position = anchor
    ? openAbove
      ? { bottom: height - anchor.y + gap, maxHeight: above }
      : { top: anchor.y + anchor.height + gap, maxHeight: below }
    : { bottom: Math.max(insets.bottom, 8) + controlSize.addAction + gap, maxHeight: height - topEdge - Math.max(insets.bottom, 8) - controlSize.addAction - gap };
  const ready = !anchorRef || anchor !== null;
  const content = (
    <View style={{ flex: 1 }} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${title}`} onPress={onDismiss}
        style={{ position: 'absolute', inset: 0, backgroundColor: palette.scrim }} />
      {ready ? <View accessibilityViewIsModal onAccessibilityEscape={onDismiss}
        style={{ position: 'absolute', left, width: popoverWidth, ...position, borderRadius: radius.control, borderWidth: 1, borderColor: palette.fieldBorder, backgroundColor: palette.surfaceModal, overflow: 'hidden' }}>
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ padding: 12, gap: 4 }}>
          {showHeader ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
            <Text ref={titleRef} accessible accessibilityRole="header" onLayout={focusTitle}
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: typeScale.sectionTitle, color: palette.textPrimary }}>{title}</Text>
            <CompactAction label={`Close ${title}`} variant="icon" icon={<X size={18} color={palette.textSecondary} />} onPress={onDismiss} />
          </View> : null}
          {children}
        </ScrollView>
      </View> : null}
    </View>
  );
  if (presentation === 'inline') return visible ? content : null;
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
    onRequestClose={onDismiss} onDismiss={restoreFocus} onShow={focusTitle}>{content}</Modal>;
}
