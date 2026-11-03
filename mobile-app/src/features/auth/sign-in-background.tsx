import { useCallback, useEffect, useId, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { designRecipes } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

/** Sign-in-only halo; foreground content never moves with the wash. */
export function SignInBackground() {
  const { palette, scheme } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  const drift = useSharedValue(0);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive) setReduced(value);
    }).catch(() => { /* Keep the static fallback if the preference cannot be read. */ });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    cancelAnimation(drift);
    if (reduced) drift.value = 0;
    else if (focused && active) {
      drift.value = 0;
      drift.value = withRepeat(withTiming(1, { duration: 5500, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => cancelAnimation(drift);
  }, [active, drift, focused, reduced]);
  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 22 }, { translateY: drift.value * -18 }, { scale: 1 + drift.value * 0.025 }],
  }));
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: palette.canvas, overflow: 'hidden' }]}>
    <Animated.View style={[{ position: 'absolute', top: -24, bottom: -24, left: -24, right: -24 }, motionStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>{designRecipes[scheme].canvas.map((layer, index) => (
          <RadialGradient key={index} id={`${id}halo${index}`}>
            {layer.colors.map((color, stop) => <Stop key={stop} offset={stop} stopColor={color.slice(0, 7)} stopOpacity={Math.min(1, (parseInt(color.slice(7, 9), 16) / 255) * 1.4)} />)}
          </RadialGradient>
        ))}</Defs>
        {designRecipes[scheme].canvas.map((layer, index) => (
          <Ellipse key={index} cx={index === 1 ? 20 : 80} cy={index === 0 ? 35 : index === 1 ? 48 : 85} rx={layer.size[0] * 50} ry={layer.size[1] * 50} fill={`url(#${id}halo${index})`} />
        ))}
      </Svg>
    </Animated.View>
  </View>;
}
