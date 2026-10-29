import { useState, type ReactNode } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect } from "react-native-svg";
import type { DashboardReport } from "@/api/dashboard-report-api-client";
import { useAppTheme } from "@/navigation/app-theme";
import {
  barHeightPercent,
  compareMoney,
  formatPhp,
  labelMonth,
} from "./dashboard-format";
type CategorySeries = DashboardReport["categoryExpenses"][number];
const plotHeight = 140;
function maximumAmount(values: readonly string[]) {
  return values.reduce(
    (maximum, value) => (compareMoney(value, maximum) > 0 ? value : maximum),
    "0.00",
  );
}

// Only geometry uses numeric coordinates. Money labels and comparisons stay exact.
function y(amount: string, maximum: string) {
  return plotHeight - (barHeightPercent(amount, maximum) / 100) * plotHeight;
}
function Plot({
  maximum,
  months,
  children,
}: {
  maximum: string;
  months: readonly string[];
  children: (width: number) => ReactNode;
}) {
  const { palette, fonts } = useAppTheme();
  const [availableWidth, setAvailableWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const width = Math.max(1, availableWidth, months.length * 34 * fontScale);
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View
        style={{
          height: plotHeight + 12,
          justifyContent: "space-between",
        }}
      >
        {[maximum, "0.00"].map((value, index) => (
          <Text
            key={index}
            style={{
              color: palette.textSecondary,
              fontFamily: fonts.regular,
              fontSize: 12,
            }}
          >
            {formatPhp(value)}
          </Text>
        ))}
      </View>
      <View
        style={{
          flex: 1,
          minWidth: 0,
        }}
        onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={months.length > 6}
        >
          <View
            style={{
              width,
            }}
          >
            <View
              pointerEvents="none"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Svg
                width={width}
                height={plotHeight + 12}
                viewBox={`0 -6 ${width} ${plotHeight + 12}`}
              >
                {[0, 0.5, 1].map((fraction) => (
                  <Line
                    key={fraction}
                    x1={0}
                    x2={width}
                    y1={fraction * plotHeight}
                    y2={fraction * plotHeight}
                    stroke={palette.fieldBorder}
                  />
                ))}
                {children(width)}
              </Svg>
            </View>
            <View
              style={{
                flexDirection: "row",
                paddingTop: 10,
              }}
            >
              {months.map((month) => (
                <Text
                  key={month}
                  style={{
                    width: width / months.length,
                    textAlign: "center",
                    color: palette.textSecondary,
                    fontFamily: fonts.regular,
                    fontSize: 12,
                  }}
                >
                  {labelMonth(month)}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
export function MonthlyBars({ report }: { report: DashboardReport }) {
  const { palette } = useAppTheme();
  const plan = report.summary.planned.monthlyEquivalent.amount;
  const maximum = maximumAmount([
    plan,
    ...report.monthlyExpenses.map((point) => point.actualAmount),
  ]);
  return (
    <Plot
      maximum={maximum}
      months={report.monthlyExpenses.map((point) => point.month)}
    >
      {(width) => (
        <>
          {report.monthlyExpenses.map((point, index, points) => {
            const column = width / points.length;
            const top = y(point.actualAmount, maximum);
            return (
              <Rect
                key={point.month}
                x={column * index + column * 0.2}
                y={top}
                width={column * 0.6}
                height={plotHeight - top}
                rx={4}
                fill={palette.chartBar}
              />
            );
          })}
          {compareMoney(plan, "0.00") > 0 ? (
            <Line
              x1={0}
              x2={width}
              y1={y(plan, maximum)}
              y2={y(plan, maximum)}
              stroke={palette.chartThreshold}
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          ) : null}
        </>
      )}
    </Plot>
  );
}
export function CategoryLines({
  report,
  colorFor,
}: {
  report: DashboardReport;
  colorFor: (category: CategorySeries) => string;
}) {
  const months = report.monthlyExpenses.map((point) => point.month);
  const maximum = maximumAmount(
    report.categoryExpenses.flatMap((category) =>
      category.months.flatMap((point) => [
        point.actualAmount,
        ...(point.monthlyBudgetAmount === null
          ? []
          : [point.monthlyBudgetAmount]),
      ]),
    ),
  );
  const { palette } = useAppTheme();
  return (
    <Plot maximum={maximum} months={months}>
      {(width) => {
        const x = (month: string) =>
          ((months.indexOf(month) + 0.5) * width) / months.length;
        return report.categoryExpenses.map((category) => {
          const color = colorFor(category);
          const points = months.map((month) =>
            category.months.find((point) => point.month === month),
          );
          // Missing values break a series rather than inventing zero spending.
          const segments: string[][] = [[]];
          for (const point of points) {
            if (!point) segments.push([]);
            else
              segments[segments.length - 1].push(
                `${x(point.month)},${y(point.actualAmount, maximum)}`,
              );
          }
          return (
            <G key={category.categoryId}>
              {segments
                .filter((segment) => segment.length > 1)
                .map((segment, index) => (
                  <Polyline
                    key={index}
                    points={segment.join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                  />
                ))}
              {points.map((point) =>
                point ? (
                  <Circle
                    key={point.month}
                    cx={x(point.month)}
                    cy={y(point.actualAmount, maximum)}
                    r={3}
                    fill={palette.surfaceModal}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                ) : null,
              )}
              {points.map((point, index) => {
                // Annual limits are never divided into invented monthly caps.
                if (!point || point.monthlyBudgetAmount === null) return null;
                return (
                  <Line
                    key={`budget-${point.month}`}
                    x1={(index * width) / months.length}
                    x2={((index + 1) * width) / months.length}
                    y1={y(point.monthlyBudgetAmount, maximum)}
                    y2={y(point.monthlyBudgetAmount, maximum)}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    strokeDasharray="4 4"
                  />
                );
              })}
            </G>
          );
        });
      }}
    </Plot>
  );
}
