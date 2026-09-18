import { describe, expect, it } from "vitest";

import { getDefaultCategoryColor } from "./category-colors";
import { projectCategoryCatalog } from "./category";

describe("Category catalog projection", () => {
  it("keeps saved colors and resolves legacy colors by stable Category ID", () => {
    const categoryById = projectCategoryCatalog([
      {
        id: "42",
        name: "Groceries",
        description: null,
        color: "teal",
        isActive: true,
      },
      {
        id: "43",
        name: "Utilities",
        description: null,
        color: null,
        isActive: false,
      },
    ]);

    expect(categoryById.get("42")).toEqual({
      key: "groceries",
      label: "Groceries",
      color: "teal",
    });
    expect(categoryById.get("43")).toEqual({
      key: "utilities",
      label: "Utilities",
      color: getDefaultCategoryColor("43"),
    });
  });
});
