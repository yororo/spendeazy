// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReportingPeriod } from "@/shared/reporting-period";
import { createSpendingPatterns } from "./spending-patterns";
import { SpendingPatternEvidence } from "./spending-pattern-evidence";

afterEach(cleanup);

it("explains recorded evidence and offers contextual investigation", () => {
  const period = "2024-08" as ReportingPeriod;
  const transactions = ["2024-02-01", "2024-03-01", "2024-04-01", "2024-08-01"].map((date, index) => ({ id: date, date, categoryId: "42", description: `Synthetic expense ${index}`, amountCents: index === 3 ? 150000 : 100000 }));
  const report = createSpendingPatterns(period, [{ id: "42", label: "Food", color: "teal", spendingCents: 150000, monthlyBudgetCents: null }], transactions, new Date(2024, 8, 1));
  const investigate = vi.fn();
  render(<SpendingPatternEvidence period={period} report={report} onViewTransactions={investigate} />);
  fireEvent.click(screen.getByText("Food · Potential increase in recorded spending"));
  expect(screen.getByText(/Median: ₱1,000.00 · Change: ₱500.00 \(50.00%\)/)).toBeTruthy();
  expect(screen.getByText(/3 contributing months/)).toBeTruthy();
  expect(screen.getByText("Synthetic expense 3")).toBeTruthy();
  expect(screen.getByText(/absence of a signal does not prove/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Investigate Food selected-month Transactions" }));
  expect(investigate).toHaveBeenLastCalledWith("42", "2024-08");
  fireEvent.click(screen.getByText(/Feb 2024 · ₱1,000.00/));
  expect(screen.getByText("Synthetic expense 0")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Investigate Food Feb 2024 Transactions" }));
  expect(investigate).toHaveBeenLastCalledWith("42", "2024-02");
});
