import { describe, expect, it, vi } from "vitest";

import {
  CategoryRulesDataError,
  getCategoryRuleSnapshot,
  getCategoryRules,
  replaceCategoryRuleSnapshot,
  replaceCategoryRules,
  type CategoryRulesApiClient,
} from "./category-rules-service";

function createRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    categoryId: "42",
    pattern: "  Rent   payment  ",
    matchType: "exact",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Category Rules service", () => {
  it("loads the owned collection with both supported match types", async () => {
    const get = vi.fn(async () => [
      createRule(),
      createRule({
        id: "2",
        pattern: "Mortgage",
        matchType: "contains",
      }),
    ]);

    await expect(
      getCategoryRules({ get } as unknown as CategoryRulesApiClient),
    ).resolves.toMatchObject([
      { id: "1", matchType: "exact" },
      { id: "2", matchType: "contains" },
    ]);
    expect(get).toHaveBeenCalledWith("/category-rules", {
      signal: undefined,
      expectedStatuses: [200],
    });
  });

  it("sends one complete replacement request and preserves original patterns", async () => {
    const put = vi.fn(async () => [
      createRule({ pattern: "  Rent   payment  " }),
      createRule({ id: "2", pattern: "MORTGAGE", matchType: "contains" }),
    ]);

    await expect(
      replaceCategoryRules({ put } as unknown as CategoryRulesApiClient, "42", [
        { pattern: "  Rent   payment  ", matchType: "exact" },
        { pattern: "MORTGAGE", matchType: "contains" },
      ]),
    ).resolves.toHaveLength(2);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      "/categories/42/rules",
      {
        rules: [
          { pattern: "  Rent   payment  ", matchType: "exact" },
          { pattern: "MORTGAGE", matchType: "contains" },
        ],
      },
      { expectedStatuses: [200] },
    );
  });

  it("rejects malformed and cross-Category replacement responses", async () => {
    const malformedPut = vi.fn(async () => [{ id: "1" }]);
    await expect(
      replaceCategoryRules(
        { put: malformedPut } as unknown as CategoryRulesApiClient,
        "42",
        [],
      ),
    ).rejects.toBeInstanceOf(CategoryRulesDataError);

    const wrongCategoryPut = vi.fn(async () => [
      createRule({ categoryId: "99" }),
    ]);
    await expect(
      replaceCategoryRules(
        { put: wrongCategoryPut } as unknown as CategoryRulesApiClient,
        "42",
        [],
      ),
    ).rejects.toThrow("another Category");

    const malformedGet = vi.fn(async () => ({ rules: [] }));
    await expect(
      getCategoryRules({
        get: malformedGet,
      } as unknown as CategoryRulesApiClient),
    ).rejects.toThrow("invalid Category Rule list");
  });

  it("loads a shared Space collection with its revision", async () => {
    const get = vi.fn(async () => ({
      rules: [createRule({ categoryId: "100" })],
      revision: "7",
    }));

    await expect(
      getCategoryRuleSnapshot(
        { get } as unknown as CategoryRulesApiClient,
        undefined,
        "10",
      ),
    ).resolves.toEqual({
      rules: [expect.objectContaining({ categoryId: "100" })],
      revision: "7",
    });
    expect(get).toHaveBeenCalledWith("/spaces/10/category-rules", {
      signal: undefined,
      expectedStatuses: [200],
    });
  });

  it("sends a revision-aware shared replacement and accepts the full collection", async () => {
    const put = vi.fn(async () => ({
      rules: [createRule({ categoryId: "100" })],
      revision: "8",
    }));

    await expect(
      replaceCategoryRuleSnapshot(
        { put } as unknown as CategoryRulesApiClient,
        "100",
        [{ pattern: "RENT", matchType: "exact" }],
        "10",
        "7",
      ),
    ).resolves.toMatchObject({ revision: "8", rules: [{ categoryId: "100" }] });
    expect(put).toHaveBeenCalledWith(
      "/spaces/10/categories/100/rules",
      {
        revision: "7",
        rules: [{ pattern: "RENT", matchType: "exact" }],
      },
      { expectedStatuses: [200] },
    );
  });
});
