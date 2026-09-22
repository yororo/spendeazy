import { describe, expect, it } from "vitest";

import { isCategoryCatalog, isCategoryCatalogItem } from "./category-catalog";

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: "42",
    name: "Groceries",
    description: null,
    color: "teal",
    isActive: true,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Category catalog projection", () => {
  it("accepts Categories with a supported saved color or a missing legacy color", () => {
    expect(isCategoryCatalogItem(category())).toBe(true);
    expect(isCategoryCatalogItem(category({ color: undefined }))).toBe(true);
    expect(isCategoryCatalogItem(category({ color: null }))).toBe(true);
    expect(isCategoryCatalog([category(), category({ id: "43" })])).toBe(true);
  });

  it.each(["#ffffff", "white", "ultraviolet"])(
    "rejects an unsupported Category Color (%s)",
    (color) => {
      expect(isCategoryCatalogItem(category({ color }))).toBe(false);
      expect(isCategoryCatalog([category({ color })])).toBe(false);
    },
  );

  it("rejects malformed Category identity and descriptive fields", () => {
    expect(isCategoryCatalogItem(category({ id: "0" }))).toBe(false);
    expect(isCategoryCatalogItem(category({ name: " " }))).toBe(false);
    expect(isCategoryCatalogItem(category({ description: 42 }))).toBe(false);
  });

  it("rejects a Category without its optimistic-concurrency version", () => {
    expect(isCategoryCatalogItem(category({ updatedAt: undefined }))).toBe(
      false,
    );
  });
});
