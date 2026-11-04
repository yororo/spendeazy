import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
} from "react-native";
import type { ElementRef, ReactNode } from "react";
import type {
  DashboardExpenseFilter,
  DashboardReport,
} from "@/api/dashboard-report-api-client";
import { CompactAction, SecondaryButton } from "@/components/buttons";
import { CalendarDays, Check, ChevronDown, ExternalLink, FileUp, History, Info } from "lucide-react-native";
import { ChoiceSheet } from "@/components/choice-sheet";
import { Popover } from "@/components/popover";
import { BodyText, Screen } from "@/components/screen";
import { controlSize, radius, space, typeScale } from "@/constants/theme";
import { CATEGORY_COLOR_VALUES } from "@/features/categories/category-catalog";
import { useAppTheme } from "@/navigation/app-theme";
import {
  meterSegments,
  dashboardPeriodLabel,
  compareMoney,
  formatPhp,
  labelMonth,
} from "./dashboard-format";
import { DesignSurface } from "@/components/design-surface";
import { CategoryMarker } from "./category-marker";
import { MonthlyBars, CategoryLines, type ChartTrigger } from "./dashboard-charts";
import type { useDashboardReport } from "./use-dashboard-report";
import { BudgetReview, CategoryReview } from './dashboard-budget-review';
import { SkeletonBlock, SkeletonRegion } from '@/components/skeleton';
const reportSectionGap = 26;
type DashboardController = ReturnType<typeof useDashboardReport>;
export function DashboardView({
  controller,
  spaceStatus,
  recoveryMessage,
  onDismissRecovery,
  onOpenExpenses,
  onOpenBudgetCategory,
  onOpenImportHistory,
  onImport,
}: {
  controller: DashboardController;
  spaceStatus: ReactNode;
  recoveryMessage?: string | null;
  onDismissRecovery?: () => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
  onOpenBudgetCategory: (categoryId: string) => void;
  onOpenImportHistory: () => void;
  onImport?: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const { report } = controller;
  const [showTrends, setShowTrends] = useState(false);
  const categoryChoices = controller.categories.filter(
    (category) =>
      category.isActive ||
      report?.categoryExpenses.some(
        (point) => point.categoryId === category.id,
      ) ||
      controller.chartCategoryIds.includes(category.id),
  );
  const chartChoices = [
    ...(report?.categoryExpenses.map((category) => ({
      id: category.categoryId,
      name: category.name,
      isActive: category.isActive,
      colorKey: category.colorKey,
    })) ?? []),
    ...categoryChoices.filter((category) =>
      !report?.categoryExpenses.some((point) => point.categoryId === category.id),
    ),
  ];
  return (
    <Screen
      title="Dashboard"
      refreshing={controller.refreshing}
      onRefresh={controller.refresh}
      headerAccessory={spaceStatus}
    >
      <View
        style={{
          gap: reportSectionGap,
        }}
      >
        {recoveryMessage ? (
          <View
            style={{
              gap: space.rowGap,
            }}
          >
            <BodyText>{recoveryMessage}</BodyText>
            {onDismissRecovery ? (
              <SecondaryButton
                label="Dismiss recovery message"
                onPress={onDismissRecovery}
              />
            ) : null}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-start", marginBottom: space.cardGap - reportSectionGap,
          }}
        >
          <MonthRangePicker resolvedLabel={report ? dashboardPeriodLabel(report) : undefined} months={controller.view === "yearly" ? "ytd" : controller.months} onSelect={(period) => {
            if (period === "ytd") controller.selectYearToDate();
            else { controller.selectMonths(period); controller.selectView("monthly"); }
          }} />
        </View>

        {controller.error ? (
          <View
            style={{
              gap: 8,
            }}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: palette.stateNegative,
                fontFamily: fonts.regular,
                fontSize: typeScale.body,
              }}
            >
              {controller.error}
            </Text>
            <SecondaryButton label="Try again" onPress={controller.refresh} />
          </View>
        ) : null}
        {controller.loading && !report ? (
          <SkeletonRegion label="Loading Dashboard">{["Summary", "Budget checks", "Category spending"].map((title, index) => <ChartCard key={title} title={title}><SkeletonBlock width="60%" height={24} /><SkeletonBlock height={index > 1 ? 180 : 72} /><SkeletonBlock width="45%" /></ChartCard>)}</SkeletonRegion>
        ) : null}

        {report ? (
          <>
            <DashboardSummary
              report={report}
              onOpenExpenses={onOpenExpenses}
              onOpenImportHistory={onOpenImportHistory}
              onImport={onImport}
            />
            <BudgetReview key={`checks:${report.range.fromDate}:${report.range.toDate}`} report={report} onOpenExpenses={onOpenExpenses} onOpenBudgetCategory={onOpenBudgetCategory} />
            {report.summary.expenseCount !== "0" ? <>
            <CategoryReview key={`review:${report.range.fromDate}:${report.range.toDate}`} report={report} onOpenExpenses={onOpenExpenses} onOpenBudgetCategory={onOpenBudgetCategory} />
            {report.monthlyExpenses.length > 1 ? <>
            <MonthlyChart key={`monthly:${report.range.fromDate}:${report.range.toDate}`} report={report} onOpenExpenses={onOpenExpenses} />
            <CompactAction label="Trends" selected={showTrends} onPress={() => setShowTrends(!showTrends)} />
            {showTrends ?
            <CategoryChart
              key={`category:${report.range.view}:${report.range.fromDate}:${report.range.toDate}`}
              report={controller.categoryReport ?? report}
              categories={chartChoices}
              selectedCategoryIds={controller.chartCategoryIds}
              categoryMarkers={controller.categoryMarkers}
              categoriesLoading={controller.categoriesLoading}
              onToggleCategory={controller.toggleChartCategory}
              onClearCategories={controller.clearChartCategories}
              onOpenExpenses={onOpenExpenses}
            /> : null}
            </> : null}
            </> : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}
function DashboardSummary({
  report,
  onOpenExpenses,
  onOpenImportHistory,
  onImport,
}: {
  report: DashboardReport;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
  onOpenImportHistory: () => void;
  onImport?: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [showDetails, setShowDetails] = useState(false);
  const infoTrigger = useRef<ElementRef<typeof View>>(null);
  const { summary, range } = report;
  const comparisonText =
    summary.comparison.direction === "no_plan"
      ? "No plan set"
      : summary.comparison.direction === "equal_plan"
        ? "Exactly on plan"
        : `${formatPhp(summary.comparison.difference.amount.replace(/^-/, ""))} ${summary.comparison.direction === "above_plan" ? "above" : "below"} plan${summary.comparison.percentage ? ` (${summary.comparison.percentage.amount}%)` : ""}`;
  const overPlan = summary.comparison.direction === "above_plan";
  return (
    <ChartCard title="Summary" inset={20} accessory={
      <Pressable
        ref={infoTrigger}
        accessibilityRole="button"
        accessibilityLabel="About this summary"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails(true)}
        style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Info size={18} color={palette.textSecondary} />
      </Pressable>
    }>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actual spending ${formatPhp(summary.actualAmount)}, view Expenses`}
          onPress={() =>
            onOpenExpenses({
              fromDate: range.fromDate,
              toDate: range.toDate,
            })
          }
          style={{
            minHeight: 48,
            maxWidth: "100%",
            flexBasis: "100%",
            gap: 3,
          }}
        >
          <SupportingText>Recorded spending</SupportingText>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 34,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPhp(summary.actualAmount)}
          </Text>
        </Pressable>
        <View
          style={{
            gap: 3,
          }}
        >
          <SupportingText>Budgeted</SupportingText>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 18,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPhp(summary.planned.amount)}
          </Text>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={comparisonText}
        style={{
          gap: 9,
        }}
      >
        <SpendingMeter actual={summary.actualAmount} limit={summary.planned.amount} prominent />
        <Text
          style={{
            color: overPlan
              ? palette.stateNegative
              : palette.textSecondary,
            fontFamily: fonts.medium,
            fontSize: 12,
            textAlign: "right",
          }}
        >
          {comparisonText}
        </Text>
      </View>
      {summary.expenseCount === "0" ? <BodyText>{onImport ? "No recorded expenses in this period. Import a statement or choose another period." : "No recorded expenses in this period. Choose another period to review spending."}</BodyText> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {onImport ? <CompactAction label="Import statement" icon={<FileUp size={18} color={palette.brandPrimary} />} onPress={onImport} /> : null}
        <CompactAction label="Statements" variant="quiet" icon={<History size={18} color={palette.textSecondary} />} onPress={onOpenImportHistory} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${summary.expenseCount} Expenses · View Expenses`}
        onPress={() => onOpenExpenses({ fromDate: range.fromDate, toDate: range.toDate })}
        style={{ alignSelf: "flex-end", minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12 }}>{`${summary.expenseCount} Expenses`}</Text>
        <ExternalLink size={14} color={palette.textSecondary} />
      </Pressable>
      <Popover
        title="About this summary"
        showHeader={false}
        visible={showDetails}
        onDismiss={() => setShowDetails(false)}
        anchorRef={infoTrigger}
      >
        <View style={{ padding: 8, gap: 12 }}>
          <BodyText>Uses current budgets for this period. Started months count in full. Annual budgets use a monthly equivalent; yearly checks use the full annual limit.</BodyText>
          <SummaryDetail label="Months counted" value={String(summary.planned.months)} />
          <SummaryDetail label="Monthly equivalent" value={formatPhp(summary.planned.monthlyEquivalent.amount)} />
          <SummaryDetail label="Annual equivalent" value={formatPhp(summary.planned.annualEquivalent.amount)} />
        </View>
      </Popover>
    </ChartCard>
  );
}
function MonthlyChart({
  report,
  onOpenExpenses,
}: {
  report: DashboardReport;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [showValues, setShowValues] = useState(false);
  const [detail, setDetail] = useState<{ month: string } | null>(null);
  const detailTrigger: ChartTrigger = useRef<ElementRef<typeof View>>(null);
  const point = report.monthlyExpenses.find((item) => item.month === detail?.month);
  const plan = report.summary.planned.monthlyEquivalent.amount;
  return (
    <ChartCard title="Monthly spending">
      <SupportingText>{`Monthly-equivalent plan ${formatPhp(plan)}`}</SupportingText>
      <MonthlyBars report={report} onSelectMonth={(month, trigger) => { detailTrigger.current = trigger.current; setDetail({ month }); }} />
      <ChoiceSheet title={point ? `${labelMonth(point.month)} ${point.month.slice(0, 4)}` : "Monthly spending"}
        visible={!!point} onDismiss={() => setDetail(null)} restoreFocusRef={detailTrigger} showClose>
        {point ? <>
          <BodyText>{`${point.fromDate}–${point.toDate} · Asia/Manila${point.inProgress ? " · In progress" : ""}`}</BodyText>
          <BodyText>{`${formatPhp(point.actualAmount)} · ${point.expenseCount} Expenses · plan ${formatPhp(plan)}`}</BodyText>
          <CompactAction label="Expenses" accessibilityLabel="View all Expenses for this month" onPress={() => { setDetail(null); onOpenExpenses(point.expenseFilter); }} />
          <BodyText>All Categories</BodyText>
          {report.categoryExpenses.map((category) => {
            const month = category.months.find((item) => item.month === point.month);
            return month ? <ValueAction key={category.categoryId} title={category.name}
              detail={`${formatPhp(month.actualAmount)} · ${month.expenseCount} Expenses`}
              onPress={() => { setDetail(null); onOpenExpenses(month.expenseFilter); }} /> : null;
          })}
        </> : null}
      </ChoiceSheet>
      <View
        style={{
          flexDirection: "row",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Legend color={palette.chartBar} label="Actual" />
        <Legend color={palette.chartThreshold} label="Monthly plan" line />
      </View>
      {report.monthlyExpenses.every((point) => point.expenseCount === "0") ? (
        <SupportingText>
          {compareMoney(plan, "0.00") === 0
            ? "No plan set or Expenses in this period."
            : "No Expenses in this period."}
        </SupportingText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showValues ? "More, hide monthly values and Expenses" : "More, show monthly values and Expenses"}
        accessibilityState={{ expanded: showValues }}
        onPress={() => setShowValues(!showValues)}
        style={{ alignSelf: "flex-end", minWidth: 48, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}
      >
        <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12, flexShrink: 1 }}>
          More
        </Text>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChevronDown size={16} color={palette.textSecondary} style={{ transform: [{ rotate: showValues ? "180deg" : "0deg" }] }} />
        </View>
      </Pressable>
      {showValues ? (
        <View style={{ backgroundColor: palette.selectedSpace, borderRadius: radius.control, padding: 12, gap: space.cardGap }}>
          {report.monthlyExpenses.map((point) => (
            <ValueAction
              key={point.month}
              title={`${labelMonth(point.month)} ${point.month.slice(0, 4)}${point.inProgress ? " · in progress" : ""}`}
              detail={`${formatPhp(point.actualAmount)} · ${point.expenseCount} Expenses · plan ${formatPhp(plan)}`}
              onPress={() => onOpenExpenses(point.expenseFilter)}
            />
          ))}
        </View>
      ) : null}
    </ChartCard>
  );
}
function CategoryChart({
  report,
  categories,
  selectedCategoryIds,
  categoryMarkers,
  categoriesLoading,
  onToggleCategory,
  onClearCategories,
  onOpenExpenses,
}: {
  report: DashboardReport;
  categories: readonly {
    id: string;
    name: string;
    isActive: boolean;
    colorKey: string | null;
  }[];
  selectedCategoryIds: readonly string[];
  categoryMarkers: Readonly<Record<string, number>>;
  categoriesLoading: boolean;
  onToggleCategory: (categoryId: string) => void;
  onClearCategories: () => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [showValues, setShowValues] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [detail, setDetail] = useState<{ month: string } | null>(null);
  const detailTrigger: ChartTrigger = useRef<ElementRef<typeof View>>(null);
  const chooserTrigger = useRef<ElementRef<typeof View>>(null);
  const selected = categories.filter((category) =>
    selectedCategoryIds.length === 0 || selectedCategoryIds.includes(category.id),
  );
  const visibleChips = selected.slice(0, 3);
  const categoryColor = (colorKey: string | null) =>
    CATEGORY_COLOR_VALUES[colorKey as keyof typeof CATEGORY_COLOR_VALUES] ?? palette.brandPrimary;
  const toggleCategory = (categoryId: string) => {
    const nextIds = selectedCategoryIds.includes(categoryId)
      ? selectedCategoryIds.filter((id) => id !== categoryId)
      : [...selectedCategoryIds, categoryId];
    onToggleCategory(categoryId);
    AccessibilityInfo.announceForAccessibility(
      `${nextIds.length === 0 ? "All Categories selected. " : ""}${nextIds.length || categories.length} of ${categories.length} selected`,
    );
  };
  const chooseAll = () => {
    onClearCategories();
    AccessibilityInfo.announceForAccessibility(`All Categories selected. ${categories.length} of ${categories.length} selected`);
  };
  const points = [...report.categoryExpenses].sort(
    (left, right) =>
      compareMoney(right.actualAmount, left.actualAmount) ||
      left.name.localeCompare(right.name),
  );
  const colorFor = (point: DashboardReport["categoryExpenses"][number]) => {
    const colorKey =
      categories.find((category) => category.id === point.categoryId)
        ?.colorKey ?? point.colorKey;
    return (
      CATEGORY_COLOR_VALUES[colorKey as keyof typeof CATEGORY_COLOR_VALUES] ??
      palette.brandPrimary
    );
  };
  return (
    <ChartCard title="Category spending" accessory={
      <DashboardInfo label="About Category spending">
        Annual Budgets retain their calendar-year limits; no monthly cap is plotted.
      </DashboardInfo>
    }>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {visibleChips.map((category) => (
          <CompactAction
            key={category.id}
            label={category.isActive ? category.name : `${category.name} · inactive`}
            icon={<CategoryMarker markerIndex={categoryMarkers[category.id]} color={categoryColor(category.colorKey)} />}
            selected
            onPress={() => toggleCategory(category.id)}
          />
        ))}
        <Pressable
          ref={chooserTrigger}
          accessibilityRole="button"
          accessibilityLabel={`Choose categories, ${selected.length} of ${categories.length} selected`}
          accessibilityState={{ expanded: choosing }}
          onPress={() => setChoosing(true)}
          style={{ minHeight: 48, minWidth: 48, justifyContent: "center" }}
        >
          <SupportingText>{selected.length > 3 ? `+${selected.length - 3} · Choose categories` : "Choose categories"}</SupportingText>
        </Pressable>
      </View>
      <ChoiceSheet
        title="Choose categories"
        visible={choosing}
        onDismiss={() => setChoosing(false)}
        restoreFocusRef={chooserTrigger}
        maxHeight="65%"
        showClose
      >
        <View>
          <CategoryChoice label="All Categories" selected={selectedCategoryIds.length === 0} onPress={chooseAll} />
          {categories.map((category) => (
            <CategoryChoice
              key={category.id}
              label={category.isActive ? category.name : `${category.name} · inactive`}
              icon={<CategoryMarker markerIndex={categoryMarkers[category.id]} color={categoryColor(category.colorKey)} />}
              selected={selectedCategoryIds.length === 0 || selectedCategoryIds.includes(category.id)}
              onPress={() => toggleCategory(category.id)}
            />
          ))}
          {categories.length === 0 ? <SupportingText>No Categories available.</SupportingText> : null}
        </View>
      </ChoiceSheet>
      {categoriesLoading && categories.length === 0 ? (
        <SupportingText>Loading Categories…</SupportingText>
      ) : points.length === 0 ? (
        <SupportingText>No Category spending in this period.</SupportingText>
      ) : (
        <>
          <CategoryLines
            report={report}
            colorFor={colorFor}
            markerIndexFor={(id) => categoryMarkers[id]}
            onSelectMonth={(month, trigger) => { detailTrigger.current = trigger.current; setDetail({ month }); }}
          />
          <ChoiceSheet title={detail ? `${labelMonth(detail.month)} ${detail.month.slice(0, 4)} · Categories` : "Category spending"}
            visible={detail !== null} onDismiss={() => setDetail(null)} restoreFocusRef={detailTrigger} showClose>
            {detail ? <BodyText>{`${report.monthlyExpenses.find((month) => month.month === detail.month)?.fromDate}–${report.monthlyExpenses.find((month) => month.month === detail.month)?.toDate} · Asia/Manila`}</BodyText> : null}
            {points.map((category) => {
              const month = category.months.find((item) => item.month === detail?.month);
              return month ? <View key={category.categoryId} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <CategoryMarker markerIndex={categoryMarkers[category.categoryId]} color={colorFor(category)} />
                  <BodyText>{category.name}</BodyText>
                </View>
                <BodyText>{`${formatPhp(month.actualAmount)} · ${month.expenseCount} Expenses${month.monthlyBudgetAmount !== null ? ` · Monthly limit ${formatPhp(month.monthlyBudgetAmount)}` : " · No Monthly limit"}${month.annualBudgetAmount !== null ? ` · Annual limit ${formatPhp(month.annualBudgetAmount)}` : ""}`}</BodyText>
                <CompactAction label="Expenses" accessibilityLabel={`View Expenses · ${category.name}`} onPress={() => { setDetail(null); onOpenExpenses(month.expenseFilter); }} />
              </View> : null;
            })}
          </ChoiceSheet>
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Legend color={palette.textSecondary} label="Spending" />
            <Legend color={palette.textSecondary} label="Monthly limit" line />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {points.map((point) => (
              <View key={point.categoryId} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CategoryMarker markerIndex={categoryMarkers[point.categoryId]} color={colorFor(point)} />
                <ValueAction title={point.name} detail={`${formatPhp(point.actualAmount)} · ${point.expenseCount} Expenses in period`}
                  onPress={() => onOpenExpenses({ fromDate: report.range.fromDate, toDate: report.range.toDate, categoryId: point.categoryId })} />
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showValues ? "More, hide Category monthly values and Expenses" : "More, show Category monthly values and Expenses"}
            accessibilityState={{ expanded: showValues }}
            onPress={() => setShowValues(!showValues)}
            style={{ alignSelf: "flex-end", minWidth: 48, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}
          >
            <Text style={{ color: palette.textSecondary, fontFamily: fonts.regular, fontSize: 12, flexShrink: 1 }}>
              More
            </Text>
            <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ChevronDown size={16} color={palette.textSecondary} style={{ transform: [{ rotate: showValues ? "180deg" : "0deg" }] }} />
            </View>
          </Pressable>
          {showValues ? (
            <View style={{ backgroundColor: palette.selectedSpace, borderRadius: radius.control, padding: 12, gap: space.cardGap }}>
              {points.map((point) => (
                <View
                  key={point.categoryId}
                  style={{
                    gap: 4,
                  }}
                >
                  <SupportingText>{point.name}</SupportingText>
                  {point.months.map((month) => (
                    <ValueAction
                      key={month.month}
                      title={`${labelMonth(month.month)} ${month.month.slice(0, 4)}`}
                      detail={`${formatPhp(month.actualAmount)} · ${month.expenseCount} Expenses${month.monthlyBudgetAmount !== null ? ` · monthly limit ${formatPhp(month.monthlyBudgetAmount)}` : ""}`}
                      onPress={() => onOpenExpenses(month.expenseFilter)}
                    />
                  ))}
                </View>

              ))}
            </View>
          ) : null}
        </>
      )}
    </ChartCard>
  );
}
function CategoryChoice({ label, icon, selected, onPress }: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ minHeight: 52, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: selected ? palette.selectedSpace : "transparent" }}
    >
      {icon}
      <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 15, color: selected ? palette.brandPrimary : palette.textPrimary }}>{label}</Text>
      {selected ? <Check size={18} color={palette.brandPrimary} /> : null}
    </Pressable>
  );
}
function SpendingMeter({ actual, limit, prominent = false }: { actual: string; limit: string; prominent?: boolean }) {
  const { palette } = useAppTheme();
  const { allocation, excess } = meterSegments(actual, limit);
  return (
    <View accessible={false} style={{ height: prominent ? 10 : 7, borderRadius: 4, overflow: "hidden", flexDirection: "row", backgroundColor: palette.meterTrack }}>
      <View style={{ height: prominent ? 10 : 7, width: `${allocation}%`, backgroundColor: prominent ? palette.chartBar : palette.spendingMeter }} />
      <View style={{ height: prominent ? 10 : 7, width: `${excess}%`, backgroundColor: palette.meterExcess }} />
    </View>
  );
}
function ValueAction({
  title,
  detail,
  color,
  onPress,
  hint = "Opens Expenses for this selection",
}: {
  title: string;
  detail: string;
  color?: string;
  hint?: string;
  onPress: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: "center",
        gap: 3,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 7,
          alignItems: "center",
        }}
      >
        {color ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: color,
            }}
          />
        ) : null}
        <Text
          style={{
            flex: 1,
            color: palette.textPrimary,
            fontFamily: fonts.medium,
            fontSize: 14,
          }}
        >
          {title}
        </Text>
      </View>
      <SupportingText>{detail}</SupportingText>
    </Pressable>
  );
}
function DashboardInfo({ label, children }: { label: string; children: string }) {
  const { palette } = useAppTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ElementRef<typeof View>>(null);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Info size={18} color={palette.textSecondary} />
      </Pressable>
      <Popover title={label} visible={open} onDismiss={() => setOpen(false)} anchorRef={trigger} showHeader={false}>
        <View style={{ padding: 8 }}>
          <BodyText>{children}</BodyText>
        </View>
      </Popover>
    </>
  );
}
function ChartCard({
  title,
  accessory,
  children,
  inset = 22,
}: {
  title: string;
  children: ReactNode;
  inset?: number;
  accessory?: ReactNode;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <DesignSurface>
      <View style={{ gap: 16, padding: inset }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: typeScale.sectionTitle,
            }}
          >
            {title}
          </Text>
          {accessory}
        </View>
        {children}
      </View>
    </DesignSurface>
  );
}
function SummaryDetail({ label, value }: { label: string; value: string }) {
  const { palette, fonts } = useAppTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
    <SupportingText>{label}</SupportingText>
    <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>{value}</Text>
  </View>;
}
function MonthRangePicker({ months, onSelect, resolvedLabel }: {
  resolvedLabel?: string;
  months: 1 | 3 | 6 | 12 | "ytd";
  onSelect: (months: 1 | 3 | 6 | 12 | "ytd") => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<ElementRef<typeof View>>(null);
  const label = resolvedLabel ?? (months === "ytd" ? "Year to date" : months === 1 ? "Last 1 month" : "Last " + months + " months");
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={"Choose period, " + label}
        accessibilityHint="Filters all dashboard reports by date"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: controlSize.minimumTarget,
          minWidth: controlSize.minimumTarget,
          maxWidth: "100%",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View pointerEvents="none" style={{
          minHeight: 44,
          paddingHorizontal: 10,
          paddingVertical: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: open ? palette.brandPrimary : palette.selectedSpaceBorder,
          backgroundColor: palette.selectedSpace,
        }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <CalendarDays size={16} color={palette.brandPrimary} />
          </View>
          <Text style={{ flexShrink: 1, color: palette.textPrimary, fontFamily: fonts.medium, fontSize: typeScale.button }}>{label}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronDown size={14} color={palette.textSecondary} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
          </View>
        </View>
      </Pressable>
      <Popover title="Period" visible={open} onDismiss={() => setOpen(false)} anchorRef={trigger} showHeader={false} width={180}>
        {([1, 3, 6, 12, "ytd"] as const).map((candidate) => (
          <CompactAction key={candidate} label={candidate === "ytd" ? "Year to date" : "Last " + candidate + (candidate === 1 ? " month" : " months")}
            selected={candidate === months} variant="quiet"
            onPress={() => { onSelect(candidate); setOpen(false); }} />
        ))}
      </Popover>
    </>
  );
}
function Legend({
  color,
  label,
  line = false,
}: {
  color: string;
  label: string;
  line?: boolean;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <View
        style={{
          width: 16,
          height: line ? 0 : 6,
          borderRadius: line ? 0 : 3,
          backgroundColor: line ? undefined : color,
          ...(line
            ? {
                borderTopWidth: 1.5,
                borderColor: color,
                borderStyle: "dashed" as const,
              }
            : {}),
        }}
      />
      <Text
        style={{
          color: palette.textSecondary,
          fontFamily: fonts.regular,
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
function SupportingText({ children }: { children: string }) {
  const { palette, fonts } = useAppTheme();
  return (
    <Text
      style={{
        color: palette.textSecondary,
        fontFamily: fonts.regular,
        fontSize: 12,
      }}
    >
      {children}
    </Text>
  );
}



