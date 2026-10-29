import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { ElementRef, ReactNode } from "react";
import type {
  DashboardBudgetStatus,
  DashboardExpenseFilter,
  DashboardReport,
} from "@/api/dashboard-report-api-client";
import type { SpaceCategory } from "@/api/categories-api-client";
import { CompactAction, SecondaryButton } from "@/components/buttons";
import { ChevronDown, Info } from "lucide-react-native";
import { ChoiceSheet } from "@/components/choice-sheet";
import { TextField } from "@/components/text-field";
import { BodyText, Screen } from "@/components/screen";
import { space, typeScale } from "@/constants/theme";
import { CATEGORY_COLOR_VALUES } from "@/features/categories/category-catalog";
import { CategoryIconMark } from "@/components/category-mark";
import { useAppTheme } from "@/navigation/app-theme";
import {
  meterSegments,
  annualUsageText,
  compareMoney,
  dashboardPeriodLabel,
  dashboardDateRange,
  formatPhp,
  labelMonth,
} from "./dashboard-format";
import { DesignSurface } from "@/components/design-surface";
import { CategoryMarker } from "./category-marker";
import { MonthlyBars, CategoryLines, type ChartTrigger } from "./dashboard-charts";
import type { useDashboardReport } from "./use-dashboard-report";
type DashboardController = ReturnType<typeof useDashboardReport>;
export function DashboardView({
  controller,
  spaceStatus,
  recoveryMessage,
  onDismissRecovery,
  onOpenExpenses,
  onOpenBudgetCategory,
  onOpenImportHistory,
}: {
  controller: DashboardController;
  spaceStatus: ReactNode;
  recoveryMessage?: string | null;
  onDismissRecovery?: () => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
  onOpenBudgetCategory: (categoryId: string) => void;
  onOpenImportHistory: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const { palette, fonts } = useAppTheme();
  const { report } = controller;
  const monthlyEndMonth = report?.monthlyExpenses.at(-1)?.month ?? null;
  const currentMonth = report?.range.today.slice(0, 7) ?? "";
  const selectedMonth = controller.monthlyEndMonth ?? monthlyEndMonth;
  const canGoNextMonth = selectedMonth !== null && selectedMonth < currentMonth;
  const selectedYear = controller.year ?? report?.range.today.slice(0, 4) ?? "";
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
      refreshing={controller.loading || controller.refreshing}
      onRefresh={controller.refresh}
      headerAccessory={spaceStatus}
    >
      <View
        style={{
          gap: 26,
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
            gap: 6,
          }}
        >
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              width: 190 * fontScale,
              maxWidth: "100%",
              alignSelf: "flex-start",
              padding: 3,
              borderRadius: 18,
              backgroundColor: palette.segmentedTrack,
            }}
          >
            <PeriodButton
              label="Monthly"
              selected={controller.view === "monthly"}
              onPress={() => controller.selectView("monthly")}
            />
            <PeriodButton
              label="Yearly"
              selected={controller.view === "yearly"}
              onPress={() => controller.selectView("yearly")}
            />
          </View>
          {controller.view === "yearly" ? (
            <YearPicker
              key={selectedYear}
              year={selectedYear}
              today={report?.range.today ?? null}
              onSelect={controller.selectYear}
            />
          ) : <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flex: 1,
              minWidth: 140,
            }}
          >
            <PeriodArrow
              label="Previous period"
              onPress={() => controller.movePeriod(-1)}
            />
            <Text
              accessibilityRole="header"
              style={{
                color: palette.textPrimary,
                fontFamily: fonts.semibold,
                fontSize: 12,
                textAlign: "center",
                flex: 1,
              }}
            >
              Six months
            </Text>
            <PeriodArrow
              label="Next period"
              onPress={() => controller.movePeriod(1)}
              disabled={!canGoNextMonth}
            />
          </View>}
          {report ? (
            <View
              style={{
                width: "100%",
              }}
            >
              <SupportingText>{dashboardPeriodLabel(report)}</SupportingText>
              <SupportingText>{dashboardDateRange(report)}</SupportingText>
            </View>
          ) : null}
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
          <BodyText>Loading Dashboard report.</BodyText>
        ) : null}

        {report ? (
          <>
            <DashboardSummary
              report={report}
              onOpenExpenses={onOpenExpenses}
              onOpenImportHistory={onOpenImportHistory}
            />
            <BudgetChecks
              report={report}
              categories={categoryChoices}
              onOpenBudgetCategory={onOpenBudgetCategory}
              onOpenExpenses={onOpenExpenses}
            />
            <MonthlyChart key={`monthly:${report.range.view}:${report.range.fromDate}:${report.range.toDate}`} report={report} onOpenExpenses={onOpenExpenses} />
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
            />
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
}: {
  report: DashboardReport;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
  onOpenImportHistory: () => void;
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
        : `${summary.comparison.direction === "above_plan" ? "Above" : "Below"} plan by ${formatPhp(summary.comparison.difference.amount)}${summary.comparison.percentage ? ` (${summary.comparison.percentage.amount}%)` : ""}`;
  const highest = summary.highestCategory;
  const overPlan = summary.comparison.direction === "above_plan";
  const latestImport = summary.statementImports.latestConfirmedAt;
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
            gap: 3,
          }}
        >
          <SupportingText>Spent</SupportingText>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 23,
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
          <SupportingText>Planned</SupportingText>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 23,
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
        <SpendingMeter actual={summary.actualAmount} limit={summary.planned.amount} />
        <Text
          style={{
            color: overPlan
              ? palette.stateNegative
              : summary.comparison.direction === "no_plan"
                ? palette.textSecondary
                : palette.statePositive,
            fontFamily: fonts.medium,
            fontSize: 12,
            textAlign: "right",
          }}
        >
          {comparisonText}
        </Text>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: palette.fieldBorder,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        {highest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Highest Category ${highest.name}, ${formatPhp(highest.amount)}, view Expenses`}
            onPress={() => onOpenExpenses(highest.expenseFilter)}
            style={{
              minHeight: 48,
              flexGrow: 1,
              flexBasis: 120,
              gap: 6,
            }}
          >
            <SupportingText>Highest spend</SupportingText>
            <Text
              style={{
                color: palette.textPrimary,
                fontFamily: fonts.medium,
                fontSize: 22,
              }}
            >
              {formatPhp(highest.amount)}
            </Text>
            <SupportingText>{highest.name}</SupportingText>
          </Pressable>
        ) : (
          <View
            style={{
              flex: 1,
              gap: 6,
            }}
          >
            <SupportingText>Highest spend</SupportingText>
            <SupportingText>No Expenses yet</SupportingText>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${summary.statementImports.count} Statement Imports confirmed in this period${latestImport ? `, latest ${importDate(latestImport)}` : ""}. View history`}
          onPress={onOpenImportHistory}
          style={{
            minHeight: 48,
            flexGrow: 1,
            flexBasis: 120,
            gap: 6,
          }}
        >
          <SupportingText>Statements imported</SupportingText>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.medium,
              fontSize: 22,
            }}
          >
            {summary.statementImports.count}
          </Text>
          <SupportingText>
            {latestImport
              ? `Last confirmed ${importDate(latestImport)}`
              : "None in this period"}
          </SupportingText>
        </Pressable>
      </View>
      <CompactAction
        label={`${summary.expenseCount} Expenses · View Expenses`}
        variant="quiet"
        onPress={() => onOpenExpenses({ fromDate: range.fromDate, toDate: range.toDate })}
      />
      <ChoiceSheet
        title="About this summary"
        visible={showDetails}
        onDismiss={() => setShowDetails(false)}
        restoreFocusRef={infoTrigger}
        showClose
      >
        <BodyText>{dashboardDateRange(report)}</BodyText>
        <BodyText>
          Current active Budget configuration applies retrospectively to this period.
          Started months count in full; there is no daily proration. Annual Budgets
          contribute their Monthly equivalent to planning and retain their full annual limits for checks.
        </BodyText>
        <BodyText>{`${summary.planned.months} ${summary.planned.months === 1 ? "month" : "months"} counted`}</BodyText>
        <BodyText>{`Monthly equivalent ${formatPhp(summary.planned.monthlyEquivalent.amount)}`}</BodyText>
        <BodyText>{`Annual equivalent ${formatPhp(summary.planned.annualEquivalent.amount)}`}</BodyText>
      </ChoiceSheet>
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
  const { palette } = useAppTheme();
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
          <CompactAction label="View all Expenses for this month" onPress={() => { setDetail(null); onOpenExpenses(point.expenseFilter); }} />
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
      <CompactAction
        label={showValues ? "Hide monthly values" : "Monthly values & Expenses"}
        variant="quiet"
        selected={showValues}
        onPress={() => setShowValues(!showValues)}
      />
      {showValues
        ? report.monthlyExpenses.map((point) => (
            <ValueAction
              key={point.month}
              title={`${labelMonth(point.month)} ${point.month.slice(0, 4)}${point.inProgress ? " · in progress" : ""}`}
              detail={`${formatPhp(point.actualAmount)} · ${point.expenseCount} Expenses · plan ${formatPhp(plan)}`}
              onPress={() => onOpenExpenses(point.expenseFilter)}
            />
          ))
        : null}
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
  const { palette } = useAppTheme();
  const [showValues, setShowValues] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [detail, setDetail] = useState<{ month: string } | null>(null);
  const detailTrigger: ChartTrigger = useRef<ElementRef<typeof View>>(null);
  const [search, setSearch] = useState("");
  const chooserTrigger = useRef<ElementRef<typeof View>>(null);
  const selected = categories.filter((category) =>
    selectedCategoryIds.length === 0 || selectedCategoryIds.includes(category.id),
  );
  const visibleChips = selected.slice(0, 3);
  const matching = categories.filter((category) =>
    category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
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
    <ChartCard title="Category spending">
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
          onPress={() => { setSearch(""); setChoosing(true); }}
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
        showClose
      >
        <Text accessibilityLiveRegion="polite" style={{ color: palette.textSecondary, fontSize: 14 }}>
          {`${selected.length} of ${categories.length} selected`}
        </Text>
        <TextField label="Search Categories" value={search} onChangeText={setSearch} autoCapitalize="none" />
        <CompactAction label="All Categories" selected={selectedCategoryIds.length === 0} onPress={chooseAll} />
        {matching.length === 0 ? (
          <BodyText>No matching Categories.</BodyText>
        ) : matching.map((category) => (
          <CompactAction
            key={category.id}
            label={category.isActive ? category.name : `${category.name} · inactive`}
            icon={<CategoryMarker markerIndex={categoryMarkers[category.id]} color={categoryColor(category.colorKey)} />}
            selected={selectedCategoryIds.length === 0 || selectedCategoryIds.includes(category.id)}
            onPress={() => toggleCategory(category.id)}
          />
        ))}
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
                <CompactAction label={`View Expenses · ${category.name}`} onPress={() => { setDetail(null); onOpenExpenses(month.expenseFilter); }} />
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
          <SupportingText>
            Annual Budgets retain their calendar-year limits; no monthly cap is
            plotted.
          </SupportingText>
          <CompactAction
            label={
              showValues
                ? "Hide Category monthly values"
                : "Category monthly values & Expenses"
            }
            variant="quiet"
            selected={showValues}
            onPress={() => setShowValues(!showValues)}
          />
          {showValues
            ? points.map((point) => (
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
              ))
            : null}
        </>
      )}
    </ChartCard>
  );
}
function BudgetChecks({
  report,
  categories,
  onOpenExpenses,
  onOpenBudgetCategory,
}: {
  report: DashboardReport;
  categories: readonly SpaceCategory[];
  onOpenBudgetCategory: (categoryId: string) => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <ChartCard title="Budget checks" inset={20}>
      <SupportingText>Months over Budget</SupportingText>
      {report.budgetChecks.monthly.length === 0 ? (
        <SupportingText>No active Monthly Budgets.</SupportingText>
      ) : (
        report.budgetChecks.monthly.map((check) => {
          const category = categories.find(
            (item) => item.id === check.categoryId,
          );
          return (
            <Pressable
              key={check.categoryId}
              accessibilityRole="button"
              accessibilityLabel={`${check.name}, ${check.overBudgetMonths} over Budget months out of ${check.eligibleMonths} completed months, monthly limit ${formatPhp(check.budgetAmount)}. Open Category Budget`}
              onPress={() => onOpenBudgetCategory(check.categoryId)}
              style={{
                minHeight: 48,
                gap: 6,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {category ? (
                  <CategoryIconMark
                    iconKey={category.iconKey}
                    colorKey={category.colorKey}
                    size={14}
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
                  {check.name}
                </Text>
                <View
                  accessible={false}
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 5,
                  }}
                >
                  {Array.from(
                    {
                      length: check.eligibleMonths,
                    },
                    (_, index) => (
                      <View
                        key={index}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor:
                            index < check.overBudgetMonths
                              ? palette.chartBar
                              : palette.meterTrack,
                        }}
                      />
                    ),
                  )}
                </View>
                <Text
                  style={{
                    color: palette.textSecondary,
                    fontFamily: fonts.medium,
                    fontSize: 12,
                  }}
                >
                  {check.eligibleMonths === 0
                    ? "—"
                    : `${check.overBudgetMonths}/${check.eligibleMonths}`}
                </Text>
              </View>
              <SupportingText>{`${check.eligibleMonths === 0 ? "No completed months · " : ""}Monthly limit ${formatPhp(check.budgetAmount)}`}</SupportingText>
            </Pressable>
          );
        })
      )}
      <View
        style={{
          height: 1,
          backgroundColor: palette.fieldBorder,
        }}
      />
      <SupportingText>Yearly Budgets</SupportingText>
      {report.budgetChecks.yearly.length === 0 ? (
        <SupportingText>No active Yearly Budgets.</SupportingText>
      ) : (
        report.budgetChecks.yearly.map((check) => (
          <View key={`${check.categoryId}-${check.year}`} style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>
              {`${check.name} · ${check.year}`}
            </Text>
            <SupportingText>{`${formatPhp(check.actualAmount)} of ${formatPhp(check.limitAmount)} annual limit`}</SupportingText>
            <SpendingMeter actual={check.actualAmount} limit={check.limitAmount} />
            <Text style={{ color: statusColor(check.status, palette), fontFamily: fonts.medium, fontSize: 12 }}>
              {`${check.status.replaceAll("_", " ")} · ${annualUsageText(check.actualAmount, check.limitAmount)}${check.usageToDate === report.range.today ? " · year to date" : ""}`}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <CompactAction
                label={`View Expenses · ${check.name} ${check.year}`}
                variant="quiet"
                onPress={() => onOpenExpenses(check.expenseFilter)}
              />
              <CompactAction
                label={`Configure Budget · ${check.name}`}
                variant="quiet"
                onPress={() => onOpenBudgetCategory(check.categoryId)}
              />
            </View>
          </View>
        ))
      )}
      <SupportingText>
        Monthly frequency excludes the in-progress month. Dots show counts, not
        the sequence of months. Yearly status uses calendar-year Expenses and
        the annual limit.
      </SupportingText>
    </ChartCard>
  );
}
function SpendingMeter({ actual, limit }: { actual: string; limit: string }) {
  const { palette } = useAppTheme();
  const { allocation, excess } = meterSegments(actual, limit);
  return (
    <View accessible={false} style={{ height: 7, borderRadius: 4, overflow: "hidden", flexDirection: "row", backgroundColor: palette.meterTrack }}>
      <View style={{ height: 7, width: `${allocation}%`, backgroundColor: palette.spendingMeter }} />
      <View style={{ height: 7, width: `${excess}%`, backgroundColor: palette.meterExcess }} />
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
    <DesignSurface
      style={{
        gap: 16,
        padding: inset,
      }}
    >
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
    </DesignSurface>
  );
}
function YearPicker({ year, today, onSelect }: {
  year: string;
  today: string | null;
  onSelect: (year: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const currentYear = today?.slice(0, 4) ?? "";
  const years = Array.from({ length: Number(currentYear) }, (_, index) =>
    String(Number(currentYear) - index).padStart(4, "0"),
  ).filter((candidate) => candidate.includes(search.trim()));
  const label = year ? `${year}${year === currentYear ? " · YTD" : ""}` : "Calendar year";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose year, ${label}`}
        accessibilityState={{ expanded: open, disabled: today === null }}
        disabled={today === null}
        onPress={() => {
          setSearch("");
          setVisibleCount(30);
          setOpen(true);
        }}
        style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: palette.textPrimary, fontFamily: fonts.medium, fontSize: 14 }}>{label}</Text>
        <ChevronDown size={16} color={palette.textSecondary} />
      </Pressable>
      <ChoiceSheet title="Choose year" visible={open && today !== null} onDismiss={() => setOpen(false)} showClose>
        <TextField
          label="Search year"
          placeholder="YYYY"
          value={search}
          keyboardType="decimal-pad"
          onChangeText={(value) => { setSearch(value); setVisibleCount(30); }}
        />
        {years.length === 0 ? <BodyText>No matching years. Choose a year through the current Manila year.</BodyText> : null}
        {years.slice(0, visibleCount).map((candidate) => (
          <CompactAction
            key={candidate}
            label={`${candidate}${candidate === currentYear ? " · YTD" : ""}`}
            selected={candidate === year}
            variant="quiet"
            onPress={() => { onSelect(candidate); setOpen(false); }}
          />
        ))}
        {years.length > visibleCount ? <CompactAction label="Show earlier years" onPress={() => setVisibleCount((count) => count + 30)} /> : null}
      </ChoiceSheet>
    </>
  );
}
function PeriodButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <CompactAction
        label={label}
        selected={selected}
        onPress={onPress}
        variant="segmented"
      />
    </View>
  );
}
function PeriodArrow({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
      }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: palette.textPrimary,
          fontFamily: fonts.medium,
          fontSize: 24,
        }}
      >
        {label === "Previous period" ? "‹" : "›"}
      </Text>
    </Pressable>
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
function statusColor(
  status: DashboardBudgetStatus,
  palette: ReturnType<typeof useAppTheme>["palette"],
) {
  return status === "over"
    ? palette.stateNegative
    : status === "normal"
      ? palette.statePositive
      : palette.stateWarning;
}
function importDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
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
