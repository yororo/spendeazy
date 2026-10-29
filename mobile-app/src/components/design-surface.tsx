import { GlassView } from 'expo-glass-effect';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { designRecipes, radius } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

// react-native-svg uses stopOpacity in place of the color's alpha channel.
function gradientStop(color: string) {
  return { stopColor: color.slice(0, 7), stopOpacity: parseInt(color.slice(7, 9), 16) / 255 };
}

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
            <Stop offset="0" {...gradientStop(layer.colors[0])} /><Stop offset="1" {...gradientStop(layer.colors[1])} />
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
export function DesignSurface({ children, style, accessibilityLabel, variant = 'summary', containerStyle }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  variant?: 'summary' | 'navigation' | 'add';
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { palette, scheme } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const recipe = designRecipes[scheme];
  const isSummary = variant === 'summary';
  const cornerRadius = isSummary ? radius.summaryCard : radius.navigation;
  const colors = variant === 'add' ? recipe.add : recipe.glass;
  const highlight = variant === 'add' ? recipe.addHighlight : variant === 'navigation' ? recipe.navigationHighlight : recipe.highlight;
  return (
    <View style={[{ borderRadius: cornerRadius, shadowColor: isSummary ? palette.summaryCardShadow : variant === 'add' ? palette.addShadow : palette.shadow, shadowOffset: { width: 0, height: isSummary ? 10 : variant === 'add' ? 6 : 8 }, shadowOpacity: 1, shadowRadius: isSummary ? 30 : variant === 'add' ? 18 : 24, elevation: 6 }, containerStyle]}>
      <GlassView accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'summary' : undefined} accessibilityLabel={accessibilityLabel} glassEffectStyle="regular" colorScheme={scheme} style={[{ borderRadius: cornerRadius, overflow: 'hidden', borderWidth: isSummary ? 1 : 1.5, borderColor: isSummary ? palette.glassBorder : variant === 'add' ? palette.addBorder : palette.navigationBorder }, style]}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs><LinearGradient id={`${id}glass`} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0" {...gradientStop(colors[0])} /><Stop offset={variant === 'add' ? '0.48' : '0.52'} {...gradientStop(colors[1])} /><Stop offset="1" {...gradientStop(colors[2])} />
            </LinearGradient></Defs>
            <Rect width="100%" height="100%" fill={variant === 'navigation' ? palette.navigation : `url(#${id}glass)`} />
            <Rect width="100%" height="1" fill={highlight} />
          </Svg>
        </View>
        {children}
      </GlassView>
    </View>
  );
}

export function SelectedTabBackground() {
  const { scheme, palette } = useAppTheme();
  const id = useId().replace(/:/g, '');
  const colors = designRecipes[scheme].selectedTab;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: palette.addBorder }]}>
    <Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" {...gradientStop(colors[0])} /><Stop offset="1" {...gradientStop(colors[1])} /></LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`} /></Svg>
  </View>;
}
