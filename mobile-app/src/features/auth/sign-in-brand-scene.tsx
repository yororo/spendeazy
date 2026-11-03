import { useCallback, useEffect, useId, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useFocusEffect } from 'expo-router';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

/** The glass surface and its contents press together as one sign-in control. */
export function SignInBrandScene({ onPress, busy = false, entering = false, onEntered }: {
  onPress: () => void;
  busy?: boolean;
  entering?: boolean;
  onEntered: () => void;
}) {
  const { palette, scheme, fonts } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const pressed = useSharedValue(0);
  const pulse = useSharedValue(1);
  const zoom = useSharedValue(0);
  const { width, height } = useWindowDimensions();
  const zoomScale = Math.max(width / 148, height / 156) * 2;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    cancelAnimation(pulse);
    if (busy && !entering && active && focused) {
      pulse.value = withRepeat(withTiming(1.035, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 120 });
    }
    return () => cancelAnimation(pulse);
  }, [active, busy, entering, focused, pulse]);
  useEffect(() => {
    if (!entering) {
      zoom.value = 0;
      return;
    }
    pressed.set(0);
    zoom.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.cubic) }, finished => {
      if (finished) scheduleOnRN(onEntered);
    });
    return () => cancelAnimation(zoom);
  }, [entering, onEntered, pressed, zoom]);
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, zoom.value * 4) }));
  const nativeGlass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * 6 }, { scale: (1 - pressed.value * 0.06) * pulse.value * (1 + zoom.value * (zoomScale - 1)) }],
    shadowOffset: { width: 0, height: 12 - pressed.value * 7 },
    shadowRadius: 24 - pressed.value * 10,
  }));

  return <View style={styles.hero}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entering ? 'Signed in' : busy ? 'Signing in with Google' : 'Sign in with Google'}
      accessibilityState={{ disabled: busy || entering, busy: busy || entering }}
      disabled={busy || entering}
      onPress={onPress}
      onPressIn={() => { pressed.set(withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) })); }}
      onPressOut={() => { pressed.set(withSpring(0, { stiffness: 260, damping: 12, mass: 0.7 })); }}>
      <Animated.View pointerEvents="none" style={[styles.pebbleShadow, { shadowColor: palette.summaryCardShadow }, pressStyle]}>
        {nativeGlass ? <GlassView glassEffectStyle="clear" colorScheme={scheme} isInteractive={false} style={styles.pebble} /> : (
          <View style={[styles.pebble, { backgroundColor: palette.glassTint, borderWidth: 1, borderColor: palette.glassBorder }]}>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor={scheme === 'dark' ? '#C5CDFF' : '#FFFFFF'} stopOpacity={0.65} />
                <Stop offset="0.42" stopColor={palette.canvas} stopOpacity={0.12} />
                <Stop offset="1" stopColor={palette.canvas} stopOpacity={0.65} />
              </LinearGradient></Defs>
              <Rect width="100%" height="100%" fill={`url(#${id})`} />
            </Svg>
          </View>
        )}
        <View style={styles.logoLayer}>
          <Image source={require('../../../assets/design/oV7Mn.png')} resizeMode="contain" accessible={false} style={styles.logo} />
          <Animated.Text style={[labelStyle, { color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata, textAlign: 'center' }]}>
            {busy || entering ? 'Signing in…' : 'Tap to sign-in'}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  hero: { width: '100%', alignItems: 'center', paddingVertical: space.dialogInset },
  pebbleShadow: { width: 148, minHeight: 156, borderRadius: 62, shadowOpacity: 1 },
  pebble: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 62, borderCurve: 'continuous', overflow: 'hidden' },
  logoLayer: { minHeight: 156, padding: space.screenHorizontal, alignItems: 'center', justifyContent: 'center', gap: space.fieldLabelGap },
  logo: { width: 72, height: 82 },
});
