import { View } from 'react-native';
import type { CategoryColorKey, CategoryIconKey } from '@/api/categories-api-client';
import { CATEGORY_COLOR_VALUES, CATEGORY_ICON_COMPONENTS } from '@/features/categories/category-catalog';

export function CategoryIconMark({ iconKey, colorKey, size = 22 }: { iconKey: CategoryIconKey; colorKey: CategoryColorKey; size?: number }) {
  const Icon = CATEGORY_ICON_COMPONENTS[iconKey];
  const color = CATEGORY_COLOR_VALUES[colorKey];
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size + 16, height: size + 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '20' }}><Icon size={size} color={color} strokeWidth={1.8} /></View>;
}
