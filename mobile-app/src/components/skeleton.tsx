import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, View, type DimensionValue } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useAppTheme } from '@/navigation/app-theme';

export function SkeletonBlock({ width = '100%', height = 14 }: { width?: DimensionValue; height?: number }) {
  const { palette } = useAppTheme();
  return <View style={{ width, height, borderRadius: 8, backgroundColor: palette.meterTrack }} />;
}
export function SkeletonRegion({ label, children }: { label: string; children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  const opacity = useSharedValue(1);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    opacity.value = focused && active && !reduced ? withRepeat(withTiming(0.55, { duration: 900 }), -1, true) : 1;
    return () => cancelAnimation(opacity);
  }, [active, focused, opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ gap: 16 }, style]}>{children}</Animated.View>
  </View>;
}
export function ListSkeleton({ label, rows = 5, total = true }: { label: string; rows?: number; total?: boolean }) {
  return <SkeletonRegion label={label}>
    {total ? <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}><SkeletonBlock width="55%" height={42} /><SkeletonBlock width="35%" /></View> : null}
    {Array.from({ length: rows }, (_, index) => <View key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 11 }}>
      <SkeletonBlock width={36} height={36} /><View style={{ flex: 1, gap: 8 }}><SkeletonBlock width="75%" /><SkeletonBlock width="45%" /></View><SkeletonBlock width={70} height={28} />
    </View>)}
  </SkeletonRegion>;
}
