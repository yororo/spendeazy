import { createContext, useContext, useRef, useState, type ElementRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Info } from 'lucide-react-native';
import type { DashboardExpenseFilter, DashboardReport } from '@/api/dashboard-report-api-client';
import type { SpaceCategory } from '@/api/categories-api-client';
import { CompactAction } from '@/components/buttons';
import { CategoryIconMark } from '@/components/category-mark';
import { ChoiceSheet } from '@/components/choice-sheet';
import { DesignSurface } from '@/components/design-surface';
import { Popover } from '@/components/popover';
import { BodyText } from '@/components/screen';
import { radius, space } from '@/constants/theme';
import { useAppTheme } from '@/navigation/app-theme';
import { compareMoney, formatPhp, labelMonth, meterSegments } from './dashboard-format';
import { budgetBalance, categoryBudgetDetail, rankReviewCategories } from './dashboard-review-rules';

type Props = {
  report: DashboardReport;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
  onOpenBudgetCategory: (id: string) => void;
};

function Caption({ children, warning = false }: { children: string; warning?: boolean }) {
  const { palette, fonts } = useAppTheme();
  return <Text style={{ color: warning ? palette.stateNegative : palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{children}</Text>;
}

function ReviewCard({ title, explanation, children }: { title: string; explanation: string; children: ReactNode }) {
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ElementRef<typeof View>>(null);
  return <DesignSurface style={{ padding: 20, gap: space.cardGap }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: palette.textPrimary }}>{title}</Text>
      <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`About ${title}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Info size={18} color={palette.textSecondary} />
      </Pressable>
    </View>
    {children}
    <Popover title={`About ${title}`} visible={open} onDismiss={() => setOpen(false)} anchorRef={trigger} showHeader={false}>
      <View style={{ padding: 8 }}><BodyText>{explanation}</BodyText></View>
    </Popover>
  </DesignSurface>;
}

function ReviewRow({ title, detail, status, over = false, mark, meter, sheetDetail, children }: {
  title: string; detail: string; status?: string; over?: boolean; mark?: ReactNode; meter?: ReactNode; sheetDetail?: string; children: ReactNode;
}) {
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ElementRef<typeof View>>(null);
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}${status ? `, ${status}` : ''}. View details`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={{ minHeight: 64, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: palette.fieldBorder }}>
      {mark}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 15 }}>{title}</Text>
        <Caption>{detail}</Caption>
        {meter}
        {status ? <Caption warning={over}>{status}</Caption> : null}
      </View>
      <ChevronRight accessible={false} size={16} color={palette.textSecondary} />
    </Pressable>
    <ChoiceSheet title={title} visible={open} onDismiss={() => setOpen(false)} restoreFocusRef={trigger} showClose>
      <View style={{ gap: space.cardGap }}>
        <BodyText>{sheetDetail ?? detail}</BodyText>
        {status ? <Caption warning={over}>{status}</Caption> : null}
        {/* Dismiss before navigating so the next screen is never behind this modal. */}
        <DismissContext onDismiss={() => setOpen(false)}>{children}</DismissContext>
      </View>
    </ChoiceSheet>
  </>;
}

// Navigation actions share modal dismissal without changing their destination filters.
const Dismiss = createContext(() => {});
function DismissContext({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  return <Dismiss.Provider value={onDismiss}>{children}</Dismiss.Provider>;
}
function DetailAction({ label, onPress }: { label: string; onPress: () => void }) {
  const dismiss = useContext(Dismiss);
  return <CompactAction label={label} variant="quiet" onPress={() => { dismiss(); onPress(); }} />;
}

function MonthRow({ month, onOpenExpenses }: { month: DashboardReport['categoryExpenses'][number]['months'][number]; onOpenExpenses: Props['onOpenExpenses'] }) {
  const { palette } = useAppTheme();
  return <View style={{ gap: 6, padding: 12, borderRadius: radius.control, backgroundColor: palette.selectedSpace }}>
    <BodyText>{`${labelMonth(month.month)} ${month.month.slice(0, 4)}`}</BodyText>
    <Caption>{`${formatPhp(month.actualAmount)}${month.monthlyBudgetAmount ? ` / ${formatPhp(month.monthlyBudgetAmount)} monthly budget` : month.annualBudgetAmount ? ' · Annual budget' : ' · No budget'}`}</Caption>
    {month.monthlyBudgetAmount ? <Caption warning={compareMoney(month.actualAmount, month.monthlyBudgetAmount) > 0}>{budgetBalance(month.actualAmount, month.monthlyBudgetAmount)}</Caption> : null}
    <DetailAction label="Expenses" onPress={() => onOpenExpenses(month.expenseFilter)} />
  </View>;
}

export function BudgetReview({ report, onOpenExpenses, onOpenBudgetCategory }: Props) {
  const { palette } = useAppTheme();
  const monthly = report.budgetChecks.monthly.filter((check) => check.overBudgetMonths > 0);
  const hasExpenses = report.summary.expenseCount !== '0';
  if (!hasExpenses && report.budgetChecks.yearly.length === 0) return null;
  return <ReviewCard title="Budget checks" explanation="Monthly checks use completed calendar months and current budgets. Recorded spending can be incomplete until you import all statements. Annual limits apply to the full calendar year, not a monthly allowance. At limit does not mean a bill has been paid.">
    {hasExpenses ? <>
      <Caption>Monthly</Caption>
      {monthly.length === 0 ? <Caption>{report.budgetChecks.monthly.length === 0 ? 'No monthly budgets' : report.budgetChecks.monthly.some((check) => check.eligibleMonths > 0) ? 'No recorded overruns' : 'No completed months'}</Caption> : monthly.map((check) => {
        const category = report.categoryExpenses.find((item) => item.categoryId === check.categoryId);
        const months = category?.months.filter((month) => !report.monthlyExpenses.find((item) => item.month === month.month)?.inProgress) ?? [];
        const single = months.length === 1 ? months[0] : null;
        return <ReviewRow key={check.categoryId} title={check.name} detail={single ? `${formatPhp(single.actualAmount)} / ${formatPhp(check.budgetAmount)}` : `Monthly budget ${formatPhp(check.budgetAmount)}`} status={single ? budgetBalance(single.actualAmount, check.budgetAmount) : `Over in ${check.overBudgetMonths} of ${check.eligibleMonths} months`} over>
          {months.map((month) => <MonthRow key={month.month} month={month} onOpenExpenses={onOpenExpenses} />)}
          <DetailAction label="Budget" onPress={() => onOpenBudgetCategory(check.categoryId)} />
        </ReviewRow>;
      })}
    </> : null}
    {report.budgetChecks.yearly.length > 0 ? <>
      <Caption>Yearly</Caption>
      {report.budgetChecks.yearly.map((check) => {
        const segments = meterSegments(check.actualAmount, check.limitAmount);
        return <View key={`${check.categoryId}:${check.year}`}>
          <ReviewRow title={`${check.name} · ${check.year}`} detail={`${formatPhp(check.actualAmount)} / ${formatPhp(check.limitAmount)}`} status={budgetBalance(check.actualAmount, check.limitAmount)} over={compareMoney(check.actualAmount, check.limitAmount) > 0}>
            <Caption>{`${check.usageFromDate} – ${check.usageToDate} · Recorded expenses`}</Caption>
            <DetailAction label="Expenses" onPress={() => onOpenExpenses(check.expenseFilter)} />
            <DetailAction label="Budget" onPress={() => onOpenBudgetCategory(check.categoryId)} />
          </ReviewRow>
          <View accessible={false} style={{ height: 4, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', backgroundColor: palette.meterTrack }}>
            <View style={{ width: `${segments.allocation}%`, backgroundColor: palette.spendingMeter }} />
            <View style={{ width: `${segments.excess}%`, backgroundColor: palette.meterExcess }} />
          </View>
        </View>;
      })}
    </> : null}
  </ReviewCard>;
}

export function CategoryReview({ report, onOpenExpenses, onOpenBudgetCategory }: Props) {
  const { palette, fonts } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const categories = rankReviewCategories(report.categoryExpenses);
  const single = report.monthlyExpenses.length === 1;
  const highest = categories.reduce((max, item) => compareMoney(item.actualAmount, max) > 0 ? item.actualAmount : max, '0.00');
  return <ReviewCard title="Category spending" explanation="All categories combine recorded expenses across statements and cash entries. Compare each month with the current monthly budget; previous budget settings are not retained here. Low recorded spending can reflect missing statements. Annual budgets retain their full-year limits in Budget checks.">
    <View>
      {(expanded ? categories : categories.slice(0, 3)).map((category) => {
        const limit = category.months[0]?.monthlyBudgetAmount;
        const scale = single ? limit : highest;
        const segments = scale && compareMoney(scale, '0.00') > 0 ? meterSegments(category.actualAmount, scale) : null;
        const overruns = category.months.filter((month) => month.monthlyBudgetAmount !== null && compareMoney(month.actualAmount, month.monthlyBudgetAmount) > 0).length;
        const exactDetail = categoryBudgetDetail(category);
        const status = single
          ? limit && segments ? budgetBalance(category.actualAmount, limit) : undefined
          : overruns ? 'Over in ' + overruns + (overruns === 1 ? ' month' : ' months') : undefined;
        return <ReviewRow key={category.categoryId} title={category.name}
          detail={single && !segments ? exactDetail : formatPhp(category.actualAmount) + ' spent'}
          sheetDetail={exactDetail} status={status} over={overruns > 0}
          meter={segments ? <View accessible={false} style={{ height: 4, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: palette.meterTrack }}>
            <View style={{ width: (segments.allocation + '%') as `${number}%`, backgroundColor: palette.spendingMeter }} />
            <View style={{ width: (segments.excess + '%') as `${number}%`, backgroundColor: palette.meterExcess }} />
          </View> : null}
          mark={<CategoryIconMark iconKey={category.iconKey as SpaceCategory['iconKey']} colorKey={(category.colorKey ?? 'violet') as SpaceCategory['colorKey']} size={14} />}>
          {single ? null : category.months.map((month) => <MonthRow key={month.month} month={month} onOpenExpenses={onOpenExpenses} />)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <DetailAction label={single ? 'Expenses' : 'All Expenses'} onPress={() => onOpenExpenses({ fromDate: report.range.fromDate, toDate: report.range.toDate, categoryId: category.categoryId })} />
            <DetailAction label="Budget" onPress={() => onOpenBudgetCategory(category.categoryId)} />
          </View>
        </ReviewRow>;
      })}
    </View>
    {categories.length > 3 ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'More, show fewer categories' : 'More, show all categories'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ alignSelf: 'flex-end', minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>More</Text>
      <ChevronDown accessible={false} size={16} color={palette.textSecondary} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
    </Pressable> : null}
  </ReviewCard>;
}

