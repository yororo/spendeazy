import { describe, expect, it } from "vitest";

import { validateCategoryForm } from "./category-form";

describe("validateCategoryForm", () => {
  it("trims names and descriptions and serializes a monthly Budget to cents", () => {
    expect(
      validateCategoryForm({
        name: "  Dining Out  ",
        description: "  Restaurants and cafes  ",
        budget: " 125.5 ",
        color: "teal",
      }),
    ).toEqual({
      errors: {},
      values: {
        name: "Dining Out",
        description: "Restaurants and cafes",
        budgetAmount: "125.50",
        color: "teal",
      },
    });
  });

  it("turns a blank description and Budget into null values", () => {
    expect(
      validateCategoryForm({
        name: "Cash",
        description: "   ",
        budget: "",
        color: "coral",
      }),
    ).toEqual({
      errors: {},
      values: {
        name: "Cash",
        description: null,
        budgetAmount: null,
        color: "coral",
      },
    });
  });

  it("reports required and maximum-length violations", () => {
    const result = validateCategoryForm({
      name: " ".repeat(101),
      description: "d".repeat(501),
      budget: "0.00",
      color: "coral",
    });

    expect(result.errors).toEqual({
      name: "Category name is required.",
      description: "Description must be 500 characters or fewer.",
      budget: "Budget must be a positive amount with at most two decimal places.",
    });
  });

  it.each([
    "12.345",
    "10000000000000",
    "-1.00",
    "not money",
  ])("rejects an invalid Budget amount: %s", (budget) => {
    expect(
      validateCategoryForm({
        name: "Travel",
        description: "",
        budget,
        color: "coral",
      }),
    ).toMatchObject({
      errors: {
        budget:
          "Budget must be a positive amount with at most two decimal places.",
      },
    });
  });
});
