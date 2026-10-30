import { useRouter } from 'expo-router';
import { ArrowLeftRight, LayoutDashboard, PieChart, Plus, UserRound } from 'lucide-react-native';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesignSurface, SelectedTabBackground } from '@/components/design-surface';
import { controlSize, radius, space } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { useSyncExternalStore } from 'react';
import { session } from '@/application/session-runtime';

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
  if (recovering) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space.screenHorizontal, right: space.screenHorizontal, bottom: Math.max(insets.bottom, 8), flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <DesignSurface variant="navigation" containerStyle={{ flex: 1 }} style={{ height: controlSize.navigation, padding: 6, paddingHorizontal: width < 324 ? 4 : 6 }}>
        <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row' }}>
          {tabs.map((tab) => {
            const route = state.routes.find((candidate) => candidate.name === tab.name);
            const selected = current === tab.name;
            return (
              <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} onPress={() => { if (route) navigateToTab(route.key); }} style={{ flex: 1, minHeight: controlSize.minimumTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 28 }}>
                {selected ? <SelectedTabBackground /> : null}
                <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <tab.Icon color={selected ? palette.brandPrimary : palette.textSecondary} size={22} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </DesignSurface>
      <DesignSurface variant="add" style={{ width: controlSize.addAction, height: controlSize.addAction }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={() => router.push('/add')} style={{ flex: 1, borderRadius: radius.navigation, alignItems: 'center', justifyContent: 'center' }}>
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Plus color={palette.onAdd} size={30} /></View>
        </Pressable>
      </DesignSurface>
    </View>
  );
}
