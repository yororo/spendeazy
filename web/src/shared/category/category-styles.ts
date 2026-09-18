import type { CategoryKey } from "./category";
import {
  getCategoryColorOption,
  type CategoryColor,
} from "./category-colors";

const categoryMarkerClasses: Readonly<Record<CategoryKey, string>> = {
  housing: "bg-category-housing",
  groceries: "bg-category-groceries",
  transport: "bg-category-transport",
  dining: "bg-category-dining",
  utilities: "bg-category-utilities",
  subscriptions: "bg-category-subscriptions",
  health: "bg-category-health",
  shopping: "bg-category-shopping",
  entertainment: "bg-category-entertainment",
  travel: "bg-category-travel",
  other: "bg-category-other",
};

function getCategoryColorClass(color: CategoryColor) {
  return getCategoryColorOption(color).className;
}

function getCategoryMarkerClass(category: CategoryKey): string {
  return categoryMarkerClasses[category];
}

export {
  getCategoryColorClass,
  getCategoryMarkerClass,
};
