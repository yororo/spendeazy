import { useContext } from "react";

import { ReportingPeriodContext } from "./reporting-period-context";

function useReportingPeriod() {
  const context = useContext(ReportingPeriodContext);

  if (!context) {
    throw new Error(
      "useReportingPeriod must be used within ReportingPeriodProvider.",
    );
  }

  return context;
}

export { useReportingPeriod };
