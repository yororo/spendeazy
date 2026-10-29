import type { DashboardReport } from "@/api/dashboard-report-api-client";

const phpNumber = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  timeZone: "UTC",
});

export function formatPhp(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{2}))?$/u.exec(amount);
  if (!match) throw new Error("Dashboard money values must be exact decimals");
  const fraction = match[3] ?? "00";
  return `${match[1] === "-" ? "-" : ""}₱${phpNumber.format(Number(match[2]))}.${fraction}`;
}

export function dashboardPeriodLabel(report: DashboardReport): string {
  if (report.range.view === "yearly") {
    const year = report.range.fromDate.slice(0, 4);
    return report.range.inProgress ? `${year} · YTD` : year;
  }
  const first =
    report.monthlyExpenses[0]?.month ?? report.range.fromDate.slice(0, 7);
  const last =
    report.monthlyExpenses.at(-1)?.month ?? report.range.toDate.slice(0, 7);
  const firstLabel = labelMonth(first);
  const lastLabel = labelMonth(last);
  const suffix =
    first.slice(0, 4) === last.slice(0, 4)
      ? last.slice(0, 4)
      : `${first.slice(0, 4)} – ${last.slice(0, 4)}`;
  return `${firstLabel} – ${lastLabel} ${suffix}${report.range.inProgress ? " · In progress" : ""}`;
}

export function isSelectableYear(year: string, today: string): boolean {
  return /^\d{4}$/u.test(year) && year >= "0001" && year <= today.slice(0, 4);
}

export function manilaDate(instant: Date): string {
  return new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dashboardDateRange(report: DashboardReport): string {
  return `${report.range.fromDate} – ${report.range.toDate} (inclusive, Asia/Manila)${report.range.inProgress ? " · In progress" : ""}`;
}

export function labelMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return monthName.format(date);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + monthNumber - 1 + offset;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (((index % 12) + 12) % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function compareMoney(left: string, right: string): number {
  const leftCents = moneyToCents(left);
  const rightCents = moneyToCents(right);
  return leftCents < rightCents ? -1 : leftCents > rightCents ? 1 : 0;
}

export function barHeightPercent(amount: string, maximum: string): number {
  const maxCents = moneyToCents(maximum);
  if (maxCents <= 0n) return 0;
  const amountCents = moneyToCents(amount);
  const bounded = amountCents > maxCents ? maxCents : amountCents;
  return Number((bounded * 10_000n) / maxCents) / 100;
}

function moneyToCents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{2}))?$/u.exec(value);
  if (!match) throw new Error("Dashboard money values must be exact decimals");
  const cents = BigInt(match[2]) * 100n + BigInt(match[3] ?? "00");
  return match[1] === "-" ? -cents : cents;
}

// Bounded drawing coordinates only; financial meaning stays in exact text/API status.
export function meterSegments(actual: string, limit: string) {
  if (compareMoney(limit, "0.00") <= 0) return { allocation: 0, excess: 0 };
  if (compareMoney(actual, limit) <= 0) {
    return { allocation: Math.max(0, barHeightPercent(actual, limit)), excess: 0 };
  }
  const allocation = barHeightPercent(limit, actual);
  return { allocation, excess: 100 - allocation };
}

export function annualUsageText(actual: string, limit: string): string {
  const cap = moneyToCents(limit);
  if (cap <= 0n) return "No plan set";
  const spent = moneyToCents(actual);
  const percentage = (spent * 1000n + cap / 2n) / cap;
  const usage = `${percentage / 10n}.${percentage % 10n}% used`;
  return spent > cap
    ? `${usage} · ${formatPhp(`${(spent - cap) / 100n}.${String((spent - cap) % 100n).padStart(2, "0")}`)} over`
    : usage;
}
