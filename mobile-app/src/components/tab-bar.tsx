import { usePathname, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ArrowLeftRight, LayoutDashboard, PieChart, Plus, RotateCcw, UserRound } from 'lucide-react-native';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesignSurface, SelectedTabBackground } from '@/components/design-surface';
import { controlSize, radius, space } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { session } from '@/application/session-runtime';

const spring = { damping: 14, stiffness: 260, mass: 0.7 };

const tabs = [
  { name: 'index', label: 'Dashboard', Icon: LayoutDashboard },
  { name: 'expenses', label: 'Expenses', Icon: ArrowLeftRight },
  { name: 'budget', label: 'Budget', Icon: PieChart },
  { name: 'profile', label: 'Profile', Icon: UserRound },
] as const;

type TabBarProps = {
  state: { index: number; routes: { name: string; key: string }[] };
  navigateToTab: (routeKey: string) => void;
};

export function SpendeazyTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { palette } = useAppTheme();
  const current = state.routes[state.index]?.name;
  const recovering = useSyncExternalStore(session.confirmation.subscribe, session.confirmation.hasReceipt, () => false);
  const ActionIcon = recovering ? RotateCcw : Plus;
  const addOpen = usePathname() === '/add';
  const pressed = useSharedValue(0);
  const open = useSharedValue(0);
  useEffect(() => {
    open.value = withSpring(addOpen ? 1 : 0, spring);
  }, [addOpen, open]);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * 0.08 }] }));
  const selectedIndex = tabs.findIndex((tab) => tab.name === current);
  const [tabWidth, setTabWidth] = useState(0);
  const indicatorX = useSharedValue(-1);
  useEffect(() => {
    if (selectedIndex < 0 || tabWidth === 0) return;
    const target = selectedIndex * tabWidth;
    indicatorX.value = indicatorX.value < 0 ? target : withSpring(target, { damping: 18, stiffness: 220, mass: 0.8 });
  }, [selectedIndex, tabWidth, indicatorX]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: Math.max(0, indicatorX.value) }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${open.value * 135}deg` }] }));

  return (
    // Native tab screens must stay below this floating navigation overlay.
    <View pointerEvents="box-none" style={{ position: 'absolute', zIndex: 1, elevation: 8, left: space.screenHorizontal, right: space.screenHorizontal, bottom: Math.max(insets.bottom, 8), flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <DesignSurface variant="navigation" containerStyle={{ flex: 1 }} style={{ height: controlSize.navigation, padding: 6, paddingHorizontal: width < 324 ? 4 : 6 }}>
        <View accessibilityRole="tablist" onLayout={(event) => setTabWidth(event.nativeEvent.layout.width / tabs.length)} style={{ flex: 1, flexDirection: 'row' }}>
          {selectedIndex >= 0 && tabWidth > 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: tabWidth }, indicatorStyle]}>
            <SelectedTabBackground />
          </Animated.View> : null}
          {tabs.map((tab) => {
            const route = state.routes.find((candidate) => candidate.name === tab.name);
            const selected = current === tab.name;
            return (
              <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { if (route) navigateToTab(route.key); }} style={{ flex: 1, minHeight: controlSize.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 28 }}>
                <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <tab.Icon color={selected ? palette.brandPrimary : palette.textSecondary} size={22} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </DesignSurface>
      <Animated.View style={buttonStyle}>
        <DesignSurface variant="add" style={{ width: controlSize.addAction, height: controlSize.addAction }}>
          <Pressable accessibilityRole="button" accessibilityLabel={recovering ? 'Check import status' : 'Add'} onPress={() => router.push(recovering ? '/import-statement' : '/add')}
            onPressIn={() => { pressed.value = withSpring(1, spring); }} onPressOut={() => { pressed.value = withSpring(0, spring); }}
            style={{ flex: 1, borderRadius: radius.navigation, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={iconStyle} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ActionIcon color={palette.onAdd} size={30} /></Animated.View>
          </Pressable>
        </DesignSurface>
      </Animated.View>
    </View>
  );
}
