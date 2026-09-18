import { useMemo, useState, type ReactNode } from "react";

import { ReportingPeriodContext } from "./reporting-period-context";
import { getCurrentReportingPeriod } from "./reporting-period";

interface ReportingPeriodProviderProps {
  children: ReactNode;
}

function ReportingPeriodProvider({ children }: ReportingPeriodProviderProps) {
  const [period, setPeriod] = useState(getCurrentReportingPeriod);
  const value = useMemo(() => ({ period, setPeriod }), [period]);

  return (
    <ReportingPeriodContext.Provider value={value}>
      {children}
    </ReportingPeriodContext.Provider>
  );
}

export { ReportingPeriodProvider };
