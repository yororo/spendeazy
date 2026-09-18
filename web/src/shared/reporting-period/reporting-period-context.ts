import { createContext } from "react";

import type { ReportingPeriod } from "./reporting-period";

interface ReportingPeriodContextValue {
  period: ReportingPeriod;
  setPeriod: (period: ReportingPeriod) => void;
}

const ReportingPeriodContext = createContext<
  ReportingPeriodContextValue | undefined
>(undefined);

export { ReportingPeriodContext };
export type { ReportingPeriodContextValue };
