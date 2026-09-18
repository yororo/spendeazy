// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportingPeriodContext } from "./reporting-period-context";
import { ReportingPeriodProvider } from "./reporting-period-provider";
import { ReportingPeriodFilter } from "./reporting-period-filter";
import type { ReportingPeriod } from "./reporting-period";

afterEach(cleanup);

describe("ReportingPeriodFilter", () => {
  it("displays a compact month label", () => {
    render(
      <ReportingPeriodContext.Provider
        value={{
          period: "2026-09" as ReportingPeriod,
          setPeriod: vi.fn(),
        }}
      >
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodContext.Provider>,
    );

    expect(screen.getByText("Sep 2026")).toBeTruthy();
  });

  it("provides a calendar button that opens the picker", () => {
    render(
      <ReportingPeriodProvider>
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodProvider>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Reporting period");
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    fireEvent.click(screen.getByRole("button", { name: "Choose reporting period" }));

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("opens the picker when the displayed reporting period is clicked", () => {
    render(
      <ReportingPeriodProvider>
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodProvider>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Reporting period");
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    fireEvent.click(screen.getByText("Sep 2026"));

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("opens the picker when the month input is clicked", () => {
    render(
      <ReportingPeriodProvider>
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodProvider>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Reporting period");
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    fireEvent.click(input);

    expect(showPicker).toHaveBeenCalledOnce();
  });

  it("focuses the month input when the browser cannot show a picker programmatically", () => {
    render(
      <ReportingPeriodProvider>
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodProvider>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Reporting period");
    const focus = vi.spyOn(input, "focus");
    Object.defineProperty(input, "showPicker", { value: undefined });

    fireEvent.click(screen.getByRole("button", { name: "Choose reporting period" }));

    expect(focus).toHaveBeenCalledOnce();
  });

  it("falls back to the month input when showPicker rejects", () => {
    render(
      <ReportingPeriodProvider>
        <ReportingPeriodFilter id="reporting-period" />
      </ReportingPeriodProvider>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Reporting period");
    const focus = vi.spyOn(input, "focus");
    input.showPicker = vi.fn(() => {
      throw new DOMException("The picker cannot be opened.", "NotAllowedError");
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose reporting period" }));

    expect(focus).toHaveBeenCalledOnce();
  });
});
