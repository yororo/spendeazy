declare const reportingPeriodBrand: unique symbol;

type ReportingPeriod = string & {
  readonly [reportingPeriodBrand]: "ReportingPeriod";
};

interface ReportingPeriodBounds {
  readonly fromDate: string;
  readonly toDate: string;
  readonly daysInPeriod: number;
}

const REPORTING_PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const reportingPeriodFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parseReportingPeriod(value: string): ReportingPeriod | null {
  return REPORTING_PERIOD_PATTERN.test(value)
    ? (value as ReportingPeriod)
    : null;
}

function getCurrentReportingPeriod(date = new Date()): ReportingPeriod {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}` as ReportingPeriod;
}

function formatReportingPeriod(period: ReportingPeriod) {
  return reportingPeriodFormatter.format(
    new Date(`${period}-01T00:00:00Z`),
  );
}

function getReportingPeriodBounds(
  period: ReportingPeriod,
): ReportingPeriodBounds {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    fromDate: `${period}-01`,
    toDate: `${period}-${String(lastDay).padStart(2, "0")}`,
    daysInPeriod: lastDay,
  };
}

export {
  formatReportingPeriod,
  getCurrentReportingPeriod,
  getReportingPeriodBounds,
  parseReportingPeriod,
};
export type { ReportingPeriod, ReportingPeriodBounds };
