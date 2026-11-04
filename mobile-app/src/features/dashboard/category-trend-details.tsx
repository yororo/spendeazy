import { useState } from 'react';
import { ChevronRight, Info } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { DashboardExpenseFilter, DashboardReport } from '@/api/dashboard-report-api-client';
import { ChoiceSheet } from '@/components/choice-sheet';
import { CategoryIconMark } from '@/components/category-mark';
import type { CategoryColorKey, CategoryIconKey } from '@/api/categories-api-client';
import { controlSize, space, typeScale } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { CategoryMarker } from './category-marker';
import type { ChartTrigger } from './dashboard-charts';
import { formatPhp, labelMonth } from './dashboard-format';

type Category = DashboardReport['categoryExpenses'][number];

function readableDate(date: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

export function CategoryTrendDetails({ report, month, categories, categoryMarkers, colorFor, restoreFocusRef, onDismiss, onOpenExpenses }: {
  report: DashboardReport;
  month?: string;
  categories: readonly Category[];
  categoryMarkers: Readonly<Record<string, number>>;
  colorFor: (category: Category) => string;
  restoreFocusRef: ChartTrigger;
  onDismiss: () => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
}) {
  const { palette } = useAppTheme();
  const [expandedMonth, setExpandedMonth] = useState<string>();
  const expanded = month !== undefined && expandedMonth === month;
  const period = report.monthlyExpenses.find((point) => point.month === month);
  const dismiss = () => { setExpandedMonth(undefined); onDismiss(); };
  return <ChoiceSheet title={month ? `${labelMonth(month)} ${month.slice(0, 4)}` : 'Category spending'}
    visible={month !== undefined} onDismiss={dismiss} restoreFocusRef={restoreFocusRef} showClose
    headerAccessory={<Pressable accessibilityRole="button" accessibilityLabel="Period details"
      accessibilityState={{ expanded }} onPress={() => setExpandedMonth(expanded ? undefined : month)}
      style={{ minHeight: controlSize.minimumTarget, minWidth: controlSize.minimumTarget, alignItems: 'center', justifyContent: 'center' }}>
      <Info size={typeScale.body} color={palette.textSecondary} />
    </Pressable>}>
    {period?.inProgress ? <Metadata>In progress</Metadata> : null}
    {expanded && period ? <Metadata>{`${readableDate(period.fromDate)} – ${readableDate(period.toDate)} · Manila time`}</Metadata> : null}
    <View>
      {categories.map((category) => {
        const point = category.months.find((item) => item.month === month);
        return point ? <CategoryMonthRow key={category.categoryId} category={category} point={point}
          markerIndex={categoryMarkers[category.categoryId]} color={colorFor(category)}
          onPress={() => { dismiss(); onOpenExpenses(point.expenseFilter); }} /> : null;
      })}
    </View>
  </ChoiceSheet>;
}

function Metadata({ children }: { children: string }) {
  const { palette, fonts } = useAppTheme();
  return <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: typeScale.metadata }}>{children}</Text>;
}

function CategoryMonthRow({ category, point, markerIndex, color, onPress }: {
  category: Category;
  point: Category['months'][number];
  markerIndex: number;
  color: string;
  onPress: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const active = point.expenseCount !== '0';
  const count = active ? `${point.expenseCount} ${point.expenseCount === '1' ? 'expense' : 'expenses'}` : 'No expenses';
  const budget = point.monthlyBudgetAmount !== null ? `Monthly limit ${formatPhp(point.monthlyBudgetAmount)}` : 'No monthly limit';
  const annual = point.annualBudgetAmount !== null ? ` · Annual limit ${formatPhp(point.annualBudgetAmount)}` : '';
  const content = <>
    <CategoryIconMark iconKey={category.iconKey as CategoryIconKey} colorKey={(category.colorKey ?? 'violet') as CategoryColorKey} size={typeScale.body} />
    <View style={{ flex: 1, gap: space.rowGap }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space.fieldLabelGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: space.fieldLabelGap }}>
          <Text style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: typeScale.body, color: palette.textPrimary }}>{category.name}</Text>
          <CategoryMarker markerIndex={markerIndex} color={color} />
        </View>
        <Text style={{ fontFamily: fonts.semibold, fontSize: typeScale.summaryMetric, color: palette.textPrimary, fontVariant: ['tabular-nums'] }}>{formatPhp(point.actualAmount)}</Text>
      </View>
      <Metadata>{count}</Metadata>
      <Metadata>{budget + annual}</Metadata>
    </View>
    {active ? <ChevronRight accessible={false} size={typeScale.body} color={palette.textSecondary} /> : null}
  </>;
  const style = { minHeight: controlSize.minimumTarget, paddingVertical: space.sheetPaddingTop, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.fieldLabelGap, borderBottomWidth: 1, borderColor: palette.divider };
  const label = `${category.name}, ${formatPhp(point.actualAmount)}, ${count}, ${budget}${annual}`;
  return active ? <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens Expenses for this category and month"
    onPress={onPress} style={({ pressed }) => ({ ...style, backgroundColor: pressed ? palette.selectedSpace : 'transparent' })}>{content}</Pressable>
    : <View accessible accessibilityLabel={label} style={style}>{content}</View>;
}
