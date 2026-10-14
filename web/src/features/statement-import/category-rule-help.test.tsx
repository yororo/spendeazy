// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryRuleHelp } from "./category-rule-help";
import type { CategorizedStatementEntry } from "./statement-categorizer";

const props: ComponentProps<typeof CategoryRuleHelp> = {
  layout: "table",
  equivalentRule: false,
  rememberRule: true,
  matchType: "exact",
  previewRows: [],
  editingId: null,
  draftDescription: undefined,
  draftError: null,
  isSaving: false,
  onSave: vi.fn(),
  onApplyWithoutRemembering: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Category Rule help actions", () => {
  it("preserves preview order, edited descriptions, and row annotations", () => {
    const row: CategorizedStatementEntry = {
      id: "edited", entryDate: new Date("2026-10-01T00:00:00.000Z"),
      postingDate: new Date("2026-10-02T00:00:00.000Z"),
      description: "Original description", amount: -10, categoryId: null,
      assignment: "unmapped", matchedCategoryIds: [], isExcluded: false,
    };
    render(<CategoryRuleHelp
      {...props}
      editingId="edited"
      draftDescription="Changed description"
      previewRows={[
        row,
        { ...row, id: "excluded", description: "Excluded expense", isExcluded: true },
        { ...row, id: "reviewed", description: "Reviewed expense", categoryId: "42", assignment: "manual" },
      ]}
    />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Changed description · Unmapped; existing Rule precedence applies",
      "Excluded expense · Excluded",
      "Reviewed expense · Reviewed assignment retained",
    ]);
    expect(screen.getByText("3 matching rows in this statement")).toBeTruthy();
    expect(screen.queryByText("Original description")).toBeNull();
  });

  it.each(["mobile", "table"] as const)("hides persistence actions until remembering is enabled on %s", (layout) => {
    render(<CategoryRuleHelp {...props} layout={layout} rememberRule={false} draftError="Lost connection" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/matching rows/)).toBeNull();
  });

  it("offers the desktop save action without an error", () => {
    render(<CategoryRuleHelp {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply & remember" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Apply without remembering" })).toBeNull();
  });

  it("leaves mobile saving to the editor when there is no error", () => {
    render(<CategoryRuleHelp {...props} layout="mobile" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it.each(["mobile", "table"] as const)("offers both recovery actions on %s", (layout) => {
    render(<CategoryRuleHelp {...props} layout={layout} draftError="Lost connection" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply without remembering" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onApplyWithoutRemembering).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/does not undo a Rule already saved/)).toBeTruthy();
  });

  it.each(["mobile", "table"] as const)("disables recovery actions while saving on %s", (layout) => {
    render(<CategoryRuleHelp {...props} layout={layout} draftError="Lost connection" isSaving />);
    expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Apply without remembering" }).hasAttribute("disabled")).toBe(true);
  });
});
