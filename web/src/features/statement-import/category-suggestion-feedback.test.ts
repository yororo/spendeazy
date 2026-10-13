import { describe, expect, it } from "vitest";

import { getCategorySuggestionFeedback } from "./category-suggestion-feedback";
import type { CategorySuggestionState } from "./use-statement-category-suggestions";

describe("Category Suggestion feedback", () => {
  it.each<{ result: CategorySuggestionState | null; count: number; feedback: string | null }>([
    { result: null, count: 0, feedback: null },
    { result: { status: "loading" }, count: 0, feedback: "loading" },
    { result: { status: "unavailable" }, count: 0, feedback: "unavailable" },
    { result: { status: "none" }, count: 0, feedback: "none" },
    { result: { status: "suggested", suggestions: [{ categoryId: "removed", categoryName: "Retired" }] }, count: 0, feedback: "none" },
    { result: { status: "suggested", suggestions: [{ categoryId: "42", categoryName: "Groceries" }] }, count: 1, feedback: null },
  ])("maps $result with $count available options to $feedback", ({ result, count, feedback }) => {
    expect(getCategorySuggestionFeedback(result, count)).toBe(feedback);
  });
});
