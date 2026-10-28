import { GlassView } from 'expo-glass-effect';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { designRecipes, radius } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

/** Place behind a viewport rather than inside its scrolling content. */
export function CanvasBackground() {
  const { palette, scheme } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const layers = designRecipes[scheme].canvas;
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: palette.canvas }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>{layers.map((layer, index) => (
          <RadialGradient key={index} id={`${id}wash${index}`}>
            <Stop offset="0" stopColor={layer.colors[0]} /><Stop offset="1" stopColor={layer.colors[1]} />
          </RadialGradient>
        ))}</Defs>
        {layers.map((layer, index) => (
          <Ellipse key={index} cx={layer.center[0] * 100} cy={layer.center[1] * 100} rx={layer.size[0] * 50} ry={layer.size[1] * 50} fill={`url(#${id}wash${index})`} />
        ))}
      </Svg>
    </View>
  );
}

/** Native glass is enhanced by a gradient and highlight on every platform. */
export function DesignSurface({ children, style, accessibilityLabel }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { palette, scheme } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const recipe = designRecipes[scheme];
  return (
    <View style={{ borderRadius: radius.summaryCard, shadowColor: palette.summaryCardShadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 1, shadowRadius: 30, elevation: 6 }}>
      <GlassView accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'summary' : undefined} accessibilityLabel={accessibilityLabel} glassEffectStyle="regular" colorScheme={scheme} style={[{ borderRadius: radius.summaryCard, overflow: 'hidden', borderWidth: 1, borderColor: palette.glassBorder }, style]}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs><LinearGradient id={`${id}glass`} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" stopColor={recipe.glass[0]} /><Stop offset="0.52" stopColor={recipe.glass[1]} /><Stop offset="1" stopColor={recipe.glass[2]} />
            </LinearGradient></Defs>
            <Rect width="100%" height="100%" fill={`url(#${id}glass)`} />
            <Rect width="100%" height="1" fill={recipe.highlight} />
          </Svg>
        </View>
        {children}
      </GlassView>
    </View>
  );
}
