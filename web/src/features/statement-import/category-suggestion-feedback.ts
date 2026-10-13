import type { CategorySuggestionState } from "./use-statement-category-suggestions";

type CategorySuggestionFeedback = "loading" | "none" | "unavailable" | null;

function getCategorySuggestionFeedback(
  result: CategorySuggestionState | null,
  availableSuggestionCount: number,
): CategorySuggestionFeedback {
  if (result === null) return null;

  switch (result.status) {
    case "loading":
      return "loading";
    case "unavailable":
      return "unavailable";
    case "none":
      return "none";
    case "suggested":
      return availableSuggestionCount === 0 ? "none" : null;
  }
}

export { getCategorySuggestionFeedback };
export type { CategorySuggestionFeedback };
