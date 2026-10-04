// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SpendingChart } from "./spending-chart";

afterEach(cleanup);

it("stacks Category colors and inspects daily totals with pointer and keyboard", () => {
  render(<SpendingChart title="Daily spending" currentLabel="Oct 2026" summary="Daily expenses" points={[
    { label: "1", amount: 100, categories: [
      { id: "food", label: "Food", color: "teal", amount: 60 },
      { id: null, label: "Uncategorized", color: null, amount: 40 },
    ] },
    { label: "2", amount: 0, categories: [] },
  ]} />);
  const first = screen.getByRole("button", { name: "Day 1: ₱100.00" });
  const segments = first.querySelectorAll("span");
  expect(segments[0]?.style.height).toBe("60%");
  expect(segments[0]?.style.backgroundColor).toBe("var(--category-teal)");
  expect(segments[1]?.style.height).toBe("40%");
  fireEvent.focus(first);
  expect(screen.getByRole("status").textContent).toContain("₱100.00");
  fireEvent.click(first);
  fireEvent.pointerLeave(first);
  expect(screen.getByRole("status").textContent).toContain("₱100.00");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss chart details" }));
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Day 2: ₱0.00" }));
  expect(screen.getByRole("status").textContent).toContain("₱0.00");
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("status")).toBeNull();
});
