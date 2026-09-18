import { describe, expect, it } from "vitest";

import { formatReportingPeriod, type ReportingPeriod } from "./reporting-period";

describe("formatReportingPeriod", () => {
  it("uses a compact three-letter month label", () => {
    expect(formatReportingPeriod("2026-09" as ReportingPeriod)).toBe(
      "Sep 2026",
    );
  });
});
