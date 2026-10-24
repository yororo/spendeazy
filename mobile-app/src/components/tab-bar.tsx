import { useRouter } from 'expo-router';
import { LayoutDashboard, List, PieChart, Plus, User } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { controlSize, radius, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';

const tabs = [
  { name: 'index', label: 'Dashboard', Icon: LayoutDashboard },
  { name: 'expenses', label: 'Expenses', Icon: List },
  { name: 'budget', label: 'Budget', Icon: PieChart },
  { name: 'profile', label: 'Profile', Icon: User },
] as const;

type TabBarProps = {
  state: { index: number; routes: { name: string; key: string }[] };
  navigateToTab: (routeKey: string) => void;
};

export function SpendeazyTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { palette, fonts } = useAppTheme();
  const current = state.routes[state.index]?.name;

  return (
    <View
      style={{
        position: 'absolute',
        left: space.screenHorizontal,
        right: space.screenHorizontal,
        bottom: Math.max(insets.bottom, 8),
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
      }}>
      <View
        accessibilityRole="tablist"
        style={{
          flex: 1,
          minHeight: controlSize.navigation,
          borderRadius: radius.navigation,
          borderCurve: 'continuous',
          backgroundColor: palette.navigation,
          borderWidth: 1.5,
          borderColor: palette.navigationBorder,
          boxShadow: `0 8px 24px ${palette.shadow}`,
          flexDirection: 'row',
          alignItems: 'center',
          padding: 6,
        }}>
        {tabs.map((tab) => {
          const route = state.routes.find((candidate) => candidate.name === tab.name);
          const selected = current === tab.name;
          const color = selected ? palette.textPrimary : palette.textSecondary;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => {
                if (route) navigateToTab(route.key);
              }}
              style={{
                flex: 1,
                minHeight: controlSize.minimumTarget,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
              <tab.Icon color={color} size={18} />
              <Text
                style={{
                  color,
                  fontFamily: selected ? fonts.semibold : fonts.regular,
                  fontSize: typeScale.sectionTitle,
                  textAlign: 'center',
                }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        onPress={() => router.push('/add')}
        style={{
          width: controlSize.addAction,
          height: controlSize.addAction,
          borderRadius: radius.navigation,
          backgroundColor: palette.add,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 6px 18px ${palette.shadow}`,
        }}>
        <Plus color={palette.onAdd} size={22} />
      </Pressable>
    </View>
  );
}
