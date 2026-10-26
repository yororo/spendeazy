import { GlassView } from "expo-glass-effect";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ReactNode } from "react";

import type {
  DashboardBudgetStatus,
  DashboardExpenseFilter,
  DashboardReport,
} from "@/api/dashboard-report-api-client";
import type { SpaceCategory } from "@/api/categories-api-client";
import { SecondaryButton } from "@/components/buttons";
import { BodyText, Screen, SupportingText } from "@/components/screen";
import { radius, space, typeScale } from "@/constants/theme";
import { CATEGORY_COLOR_VALUES } from "@/features/categories/category-catalog";
import { CategoryIconMark } from "@/features/categories/category-configuration-view";
import { useAppTheme } from "@/navigation/app-theme";
import {
  barHeightPercent,
  compareMoney,
  dashboardPeriodLabel,
  formatPhp,
  labelMonth,
} from "./dashboard-format";
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
  const { palette, fonts } = useAppTheme();
  const { report } = controller;
  const monthlyEndMonth = report?.monthlyExpenses.at(-1)?.month ?? null;
  const currentMonth = report?.range.today.slice(0, 7) ?? "";
  const selectedMonth = controller.monthlyEndMonth ?? monthlyEndMonth;
  const canGoNextMonth = selectedMonth !== null && selectedMonth < currentMonth;
  const selectedYear = controller.year ?? report?.range.today.slice(0, 4) ?? "";
  const canGoNextYear = Boolean(
    report && selectedYear < report.range.today.slice(0, 4),
  );
  const categoryChoices = controller.categories.filter(
    (category) =>
      category.isActive ||
      report?.categoryExpenses.some(
        (point) => point.categoryId === category.id,
      ) ||
      controller.chartCategoryIds.includes(category.id),
  );

  return (
    <Screen
      title="Dashboard"
      refreshing={controller.loading || controller.refreshing}
      onRefresh={controller.refresh}
    >
      <View style={{ gap: space.cardGap }}>
        {spaceStatus}
        {recoveryMessage ? (
          <View style={{ gap: space.rowGap }}>
            <BodyText>{recoveryMessage}</BodyText>
            {onDismissRecovery ? (
              <SecondaryButton
                label="Dismiss recovery message"
                onPress={onDismissRecovery}
              />
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <View
            accessibilityRole="tablist"
            style={{ flexDirection: "row", gap: 10 }}
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
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
                fontSize: typeScale.body,
                textAlign: "center",
                flex: 1,
              }}
            >
              {report
                ? dashboardPeriodLabel(report)
                : controller.view === "monthly"
                  ? "Six months"
                  : "Calendar year"}
            </Text>
            <PeriodArrow
              label="Next period"
              onPress={() => controller.movePeriod(1)}
              disabled={
                controller.view === "monthly" ? !canGoNextMonth : !canGoNextYear
              }
            />
          </View>
        </View>

        {controller.error ? (
          <View style={{ gap: 8 }}>
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
            <MonthlyChart report={report} onOpenExpenses={onOpenExpenses} />
            <CategoryChart
              report={report}
              categories={categoryChoices}
              selectedCategoryIds={controller.chartCategoryIds}
              categoriesLoading={controller.categoriesLoading}
              onToggleCategory={controller.toggleChartCategory}
              onClearCategories={controller.clearChartCategories}
              onOpenExpenses={onOpenExpenses}
            />
            <BudgetChecks
              report={report}
              onOpenBudgetCategory={onOpenBudgetCategory}
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
  const { palette, fonts, scheme } = useAppTheme();
  const { summary, range } = report;
  const comparisonText =
    summary.comparison.direction === "no_plan"
      ? "No plan set"
      : summary.comparison.direction === "equal_plan"
        ? "Exactly on plan"
        : `${summary.comparison.direction === "above_plan" ? "Above" : "Below"} plan by ${formatPhp(summary.comparison.difference.amount)}${summary.comparison.percentage ? ` (${summary.comparison.percentage.amount}%)` : ""}`;
  const highest = summary.highestCategory;
  return (
    <GlassView
      accessible={false}
      glassEffectStyle="regular"
      colorScheme={scheme}
      tintColor={palette.glassTint}
      style={cardStyle(palette)}
    >
      <View style={{ gap: 6 }}>
        <Text style={eyebrowStyle(palette, fonts)}>ACTUAL SPENDING</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actual spending ${formatPhp(summary.actualAmount)}, view Expenses`}
          accessibilityHint="Opens Expenses for the full Dashboard period"
          onPress={() =>
            onOpenExpenses({ fromDate: range.fromDate, toDate: range.toDate })
          }
          style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: 31,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPhp(summary.actualAmount)}
          </Text>
        </Pressable>
        <SupportingText>{`${summary.expenseCount} Expenses${range.inProgress ? " · period in progress" : ""}`}</SupportingText>
      </View>
      <View style={{ height: 1, backgroundColor: palette.fieldBorder }} />
      <View style={{ flexDirection: "row", gap: 20 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={eyebrowStyle(palette, fonts)}>PLANNED</Text>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: typeScale.summaryMetric,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPhp(summary.planned.amount)}
          </Text>
          <SupportingText>{`${summary.planned.months} ${summary.planned.months === 1 ? "month" : "months"} · current Budgets`}</SupportingText>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={eyebrowStyle(palette, fonts)}>MONTHLY EQUIVALENT</Text>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: typeScale.summaryMetric,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPhp(summary.planned.monthlyEquivalent.amount)}
          </Text>
          <SupportingText>{`Annual equivalent ${formatPhp(summary.planned.annualEquivalent.amount)}`}</SupportingText>
        </View>
      </View>
      <Text
        style={{
          color: palette.textSecondary,
          fontFamily: fonts.medium,
          fontSize: typeScale.body,
        }}
      >
        {comparisonText}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {highest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Highest Category ${highest.name}, ${formatPhp(highest.amount)}, view Expenses`}
            accessibilityHint="Opens Expenses for this Category and Dashboard period"
            onPress={() => onOpenExpenses(highest.expenseFilter)}
            style={{ minHeight: 48, justifyContent: "center", gap: 2 }}
          >
            <Text style={eyebrowStyle(palette, fonts)}>HIGHEST CATEGORY</Text>
            <Text
              style={{
                color: palette.brandPrimary,
                fontFamily: fonts.semibold,
                fontSize: typeScale.body,
              }}
            >
              {highest.name} · {formatPhp(highest.amount)}
            </Text>
          </Pressable>
        ) : (
          <View style={{ minHeight: 48, justifyContent: "center" }}>
            <Text style={eyebrowStyle(palette, fonts)}>HIGHEST CATEGORY</Text>
            <SupportingText>No Expenses yet</SupportingText>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${summary.statementImports.count} Statement Imports confirmed in this period`}
          accessibilityHint="Opens Statement Import history"
          onPress={onOpenImportHistory}
          style={{ minHeight: 48, justifyContent: "center", gap: 2 }}
        >
          <Text style={eyebrowStyle(palette, fonts)}>IMPORTS</Text>
          <Text
            style={{
              color: palette.textPrimary,
              fontFamily: fonts.semibold,
              fontSize: typeScale.body,
            }}
          >
            {summary.statementImports.count} confirmed
          </Text>
        </Pressable>
      </View>
    </GlassView>
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
  const monthlyPlan = report.summary.planned.monthlyEquivalent.amount;
  const maximum = report.monthlyExpenses.reduce(
    (current, point) =>
      compareMoney(point.actualAmount, current) > 0
        ? point.actualAmount
        : current,
    monthlyPlan,
  );
  const chartHeight = 110;
  return (
    <ChartCard
      title="Spending by month"
      subtitle="Actual Expenses compared with your monthly-equivalent plan"
    >
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Legend color={palette.brandPrimary} label="Actual" />
        <Legend color={palette.stateWarning} label="Monthly plan" line />
      </View>
      {report.monthlyExpenses.every((point) => point.expenseCount === "0") &&
      compareMoney(monthlyPlan, "0.00") === 0 ? (
        <SupportingText>
          No plan set or Expenses in this period.
        </SupportingText>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {report.monthlyExpenses.map((point) => {
            const actualPercent = barHeightPercent(point.actualAmount, maximum);
            const planPercent = barHeightPercent(monthlyPlan, maximum);
            return (
              <Pressable
                key={point.month}
                accessibilityRole="button"
                accessibilityLabel={`${labelMonth(point.month)} actual ${formatPhp(point.actualAmount)}, monthly plan ${formatPhp(monthlyPlan)}. View Expenses`}
                accessibilityHint={`Opens Expenses from ${point.fromDate} through ${point.toDate}`}
                onPress={() => onOpenExpenses(point.expenseFilter)}
                style={{
                  width: 48,
                  minHeight: 150,
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: chartHeight,
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  {compareMoney(monthlyPlan, "0.00") > 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: (planPercent / 100) * chartHeight,
                        borderTopWidth: 2,
                        borderStyle: "dashed",
                        borderColor: palette.stateWarning,
                        zIndex: 2,
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      width: 26,
                      height: Math.max(0, (actualPercent / 100) * chartHeight),
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      backgroundColor: palette.brandPrimary,
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: palette.textSecondary,
                    fontFamily: fonts.medium,
                    fontSize: typeScale.metadata,
                  }}
                >
                  {labelMonth(point.month)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </ChartCard>
  );
}

function CategoryChart({
  report,
  categories,
  selectedCategoryIds,
  categoriesLoading,
  onToggleCategory,
  onClearCategories,
  onOpenExpenses,
}: {
  report: DashboardReport;
  categories: readonly SpaceCategory[];
  selectedCategoryIds: readonly string[];
  categoriesLoading: boolean;
  onToggleCategory: (categoryId: string) => void;
  onClearCategories: () => void;
  onOpenExpenses: (filter: DashboardExpenseFilter) => void;
}) {
  const { palette, fonts } = useAppTheme();
  const maxAmount = report.categoryExpenses.reduce(
    (maximum, category) =>
      compareMoney(category.actualAmount, maximum) > 0
        ? category.actualAmount
        : maximum,
    "0.00",
  );
  const points = [...report.categoryExpenses].sort(
    (left, right) =>
      compareMoney(right.actualAmount, left.actualAmount) ||
      left.name.localeCompare(right.name),
  );
  return (
    <ChartCard
      title="Spending by Category"
      subtitle="Select Categories to filter this chart"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <SecondaryButton
          label="All Categories"
          selected={selectedCategoryIds.length === 0}
          onPress={onClearCategories}
        />
        {categories.map((category) => (
          <SecondaryButton
            key={category.id}
            label={
              category.isActive ? category.name : `${category.name} · inactive`
            }
            selected={selectedCategoryIds.includes(category.id)}
            onPress={() => onToggleCategory(category.id)}
          />
        ))}
      </ScrollView>
      {categoriesLoading && categories.length === 0 ? (
        <SupportingText>Loading Categories…</SupportingText>
      ) : points.length === 0 ? (
        <SupportingText>No Category spending in this period.</SupportingText>
      ) : (
        <View style={{ gap: 14 }}>
          {points.map((point) => {
            const category = categories.find(
              (item) => item.id === point.categoryId,
            );
            const color = category
              ? CATEGORY_COLOR_VALUES[category.colorKey]
              : palette.brandPrimary;
            return (
              <Pressable
                key={point.categoryId}
                accessibilityRole="button"
                accessibilityLabel={`${point.name}, ${formatPhp(point.actualAmount)}. View Expenses`}
                accessibilityHint="Opens Expenses for this Category and Dashboard period"
                onPress={() =>
                  onOpenExpenses({
                    fromDate: report.range.fromDate,
                    toDate: report.range.toDate,
                    categoryId: point.categoryId,
                  })
                }
                style={{ minHeight: 64, justifyContent: "center", gap: 7 }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
                >
                  {category ? (
                    <CategoryIconMark
                      iconKey={category.iconKey}
                      colorKey={category.colorKey}
                      size={16}
                    />
                  ) : null}
                  <Text
                    style={{
                      flex: 1,
                      color: palette.textPrimary,
                      fontFamily: fonts.semibold,
                      fontSize: typeScale.body,
                    }}
                  >
                    {point.name}
                    {!point.isActive ? " · inactive" : ""}
                  </Text>
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontFamily: fonts.medium,
                      fontSize: typeScale.body,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatPhp(point.actualAmount)}
                  </Text>
                </View>
                <View
                  style={{
                    height: 8,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: palette.fieldBorder,
                  }}
                >
                  <View
                    style={{
                      height: 8,
                      width: `${barHeightPercent(point.actualAmount, maxAmount)}%`,
                      borderRadius: 8,
                      backgroundColor: color,
                    }}
                  />
                </View>
                {point.budget ? (
                  <SupportingText>
                    {point.budget.period === "monthly"
                      ? `Monthly limit ${formatPhp(point.budget.amount)}`
                      : `Annual Budget ${formatPhp(point.budget.amount)}`}
                  </SupportingText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </ChartCard>
  );
}

function BudgetChecks({
  report,
  onOpenBudgetCategory,
}: {
  report: DashboardReport;
  onOpenBudgetCategory: (categoryId: string) => void;
}) {
  const { palette, fonts } = useAppTheme();
  return (
    <ChartCard
      title="Budget checks"
      subtitle="Current active Budgets applied to this reporting period"
    >
      <Text accessibilityRole="header" style={sectionHeading(palette, fonts)}>
        Monthly Budgets
      </Text>
      {report.budgetChecks.monthly.length === 0 ? (
        <SupportingText>No active Monthly Budgets.</SupportingText>
      ) : (
        report.budgetChecks.monthly.map((check) => (
          <BudgetCheckRow
            key={check.categoryId}
            label={
              check.eligibleMonths === 0
                ? `${check.name}, no completed months to check`
                : `${check.name}, ${check.overBudgetMonths} over Budget months out of ${check.eligibleMonths} completed months`
            }
            title={check.name}
            detail={
              check.eligibleMonths === 0
                ? `— · limit ${formatPhp(check.budgetAmount)}`
                : `${check.overBudgetMonths} over · ${check.eligibleMonths} completed months · limit ${formatPhp(check.budgetAmount)}`
            }
            status={
              check.eligibleMonths === 0
                ? null
                : check.overBudgetMonths > 0
                  ? "over"
                  : "normal"
            }
            onPress={() => onOpenBudgetCategory(check.categoryId)}
          />
        ))
      )}
      <Text accessibilityRole="header" style={sectionHeading(palette, fonts)}>
        Yearly Budgets
      </Text>
      {report.budgetChecks.yearly.length === 0 ? (
        <SupportingText>No active Yearly Budgets.</SupportingText>
      ) : (
        report.budgetChecks.yearly.map((check) => (
          <BudgetCheckRow
            key={`${check.categoryId}-${check.year}`}
            label={`${check.name}, ${check.year}, ${formatPhp(check.actualAmount)} of ${formatPhp(check.limitAmount)}, ${check.status}`}
            title={`${check.name} · ${check.year}`}
            detail={`${formatPhp(check.actualAmount)} of ${formatPhp(check.limitAmount)}${check.usageToDate === report.range.today ? " · year to date" : ""}`}
            status={check.status}
            onPress={() => onOpenBudgetCategory(check.categoryId)}
          />
        ))
      )}
      <SupportingText>
        Monthly status excludes the in-progress month. Yearly status compares
        calendar-year Expenses with the annual limit. Select a check to open its
        Category Budget.
      </SupportingText>
    </ChartCard>
  );
}

function BudgetCheckRow({
  label,
  title,
  detail,
  status,
  onPress,
}: {
  label: string;
  title: string;
  detail: string;
  status: DashboardBudgetStatus | null;
  onPress: () => void;
}) {
  const { palette, fonts } = useAppTheme();
  const color =
    status === null
      ? palette.textSecondary
      : status === "over"
        ? palette.stateNegative
        : status === "nearing" || status === "at_limit"
          ? palette.stateWarning
          : palette.statePositive;
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 8,
          height: 38,
          borderRadius: 6,
          backgroundColor: color,
        }}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{
            color: palette.textPrimary,
            fontFamily: fonts.semibold,
            fontSize: typeScale.body,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: palette.textSecondary,
            fontFamily: fonts.regular,
            fontSize: typeScale.metadata,
          }}
        >
          {detail}
        </Text>
      </View>
      <Text
        style={{
          color,
          fontFamily: fonts.semibold,
          fontSize: typeScale.metadata,
          textTransform: "uppercase",
        }}
      >
        {status === null ? "—" : status.replace("_", " ")}
      </Text>
    </Pressable>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { palette, fonts, scheme } = useAppTheme();
  return (
    <GlassView
      accessible={false}
      glassEffectStyle="regular"
      colorScheme={scheme}
      tintColor={palette.glassTint}
      style={cardStyle(palette)}
    >
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={sectionHeading(palette, fonts)}>
          {title}
        </Text>
        <SupportingText>{subtitle}</SupportingText>
      </View>
      {children}
    </GlassView>
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
  const { palette, fonts } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} Dashboard view`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: selected ? palette.brandPrimary : palette.fieldBorder,
        backgroundColor: selected ? palette.brandPrimary : palette.surfaceModal,
      }}
    >
      <Text
        style={{
          color: selected ? palette.onBrand : palette.textPrimary,
          fontFamily: fonts.semibold,
          fontSize: typeScale.button,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: palette.fieldBorder,
        borderRadius: radius.control,
        backgroundColor: palette.surfaceModal,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: palette.brandPrimary,
          fontFamily: fonts.semibold,
          fontSize: 20,
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 12,
          height: line ? 2 : 12,
          borderRadius: line ? 0 : 6,
          backgroundColor: color,
          ...(line
            ? { borderTopWidth: 1, borderStyle: "dashed" as const }
            : {}),
        }}
      />
      <Text
        style={{
          color: palette.textSecondary,
          fontFamily: fonts.medium,
          fontSize: typeScale.metadata,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function cardStyle(palette: ReturnType<typeof useAppTheme>["palette"]) {
  return {
    gap: space.cardGap,
    padding: space.cardInset,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.summaryCard,
    borderCurve: "continuous" as const,
    overflow: "hidden" as const,
    backgroundColor: palette.glassTint,
  };
}

function eyebrowStyle(
  palette: ReturnType<typeof useAppTheme>["palette"],
  fonts: ReturnType<typeof useAppTheme>["fonts"],
) {
  return {
    color: palette.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: typeScale.metadata,
    letterSpacing: 0.7,
  } as const;
}

function sectionHeading(
  palette: ReturnType<typeof useAppTheme>["palette"],
  fonts: ReturnType<typeof useAppTheme>["fonts"],
) {
  return {
    color: palette.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: typeScale.sectionTitle,
  } as const;
}
