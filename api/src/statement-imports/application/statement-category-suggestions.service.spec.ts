import type {
  CategorySuggestionCatalogStore,
  CategorySuggestionCandidate,
  CategorySuggestionEvaluator,
} from './statement-category-suggestions';
import { StatementCategorySuggestionsService } from './statement-category-suggestions.service';

describe('StatementCategorySuggestionsService', () => {
  const categories: readonly CategorySuggestionCandidate[] = [
    { id: '42', name: 'Groceries', description: 'Food and household supplies' },
    { id: '43', name: 'Transport', description: null },
  ];

  it('evaluates the trimmed description against active Categories in the destination Space', async () => {
    const examples = [
      { categoryId: '42', description: 'Metro Market North' },
      { categoryId: '43', description: 'Ride share to work' },
    ];
    const findSuggestionCatalogInSpace = jest.fn().mockResolvedValue({
      categories,
      examples,
    });
    const findActiveCategoryInSpace = jest
      .fn()
      .mockResolvedValue(categories[0]);
    const suggestCategory =
      createSuggestCategoryEvaluator().mockResolvedValue('42');
    const catalogStore: CategorySuggestionCatalogStore = {
      findSuggestionCatalogInSpace,
      findActiveCategoryInSpace,
    };
    const evaluator: CategorySuggestionEvaluator = {
      suggestCategory,
    };
    const service = new StatementCategorySuggestionsService(
      catalogStore,
      evaluator,
    );

    await expect(
      service.suggestInSpace('7', '  Market purchase  '),
    ).resolves.toEqual({ categoryId: '42', categoryName: 'Groceries' });

    expect(findSuggestionCatalogInSpace).toHaveBeenCalledWith('7');
    expect(findActiveCategoryInSpace).toHaveBeenCalledWith('7', '42');
    expect(suggestCategory).toHaveBeenCalledWith(
      'Market purchase',
      categories,
      [{ categoryId: '42', description: 'Metro Market North' }],
    );
  });

  it('keeps active Category names available when history has no useful examples', async () => {
    const suggestCategory =
      createSuggestCategoryEvaluator().mockResolvedValue('42');
    const service = new StatementCategorySuggestionsService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories,
          examples: [
            { categoryId: '43', description: 'Bus route to the office' },
          ],
        }),
        findActiveCategoryInSpace: jest.fn().mockResolvedValue(categories[0]),
      },
      { suggestCategory },
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toEqual({ categoryId: '42', categoryName: 'Groceries' });
    expect(suggestCategory).toHaveBeenCalledWith(
      'Market purchase',
      categories,
      [],
    );
  });

  it('sends at most sixteen relevant examples from distinct active Categories', async () => {
    const manyCategories = Array.from({ length: 20 }, (_, index) => ({
      id: String(100 + index),
      name: `Category ${index}`,
      description: null,
    }));
    const examples = manyCategories.map(({ id }, index) => ({
      categoryId: id,
      description: `Market purchase example ${index}`,
    }));
    const suggestCategory =
      createSuggestCategoryEvaluator().mockResolvedValue(null);
    const service = new StatementCategorySuggestionsService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories: manyCategories,
          examples,
        }),
        findActiveCategoryInSpace: jest.fn().mockResolvedValue(null),
      },
      { suggestCategory },
    );

    await service.suggestInSpace('7', 'Market purchase');

    const sentExamples = suggestCategory.mock.calls[0]?.[2] as
      readonly { categoryId: string; description: string }[] | undefined;
    expect(sentExamples).toHaveLength(16);
    expect(
      new Set(sentExamples?.map(({ categoryId }) => categoryId)).size,
    ).toBe(16);
  });

  it('ranks rare merchant words ahead of common purchase terms', async () => {
    const manyCategories = Array.from({ length: 17 }, (_, index) => ({
      id: String(100 + index),
      name: `Category ${index}`,
      description: null,
    }));
    const examples = manyCategories.map(({ id }, index) => ({
      categoryId: id,
      description: index === 16 ? 'Metro cafe' : `Online purchase ${index}`,
    }));
    const suggestCategory = createSuggestCategoryEvaluator();
    const service = new StatementCategorySuggestionsService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories: manyCategories,
          examples,
        }),
        findActiveCategoryInSpace: jest.fn().mockResolvedValue(null),
      },
      { suggestCategory },
    );

    await service.suggestInSpace('7', 'Metro purchase');

    const sentExamples = suggestCategory.mock.calls[0]?.[2] as
      readonly { categoryId: string; description: string }[] | undefined;
    expect(sentExamples).toHaveLength(16);
    expect(sentExamples?.[0]).toEqual({
      categoryId: '116',
      description: 'Metro cafe',
    });
  });

  it.each(['none_of_the_above', '999'])(
    'returns no suggestion when the evaluator selects %s',
    async (selectedId) => {
      const evaluator: CategorySuggestionEvaluator = {
        suggestCategory: jest.fn().mockResolvedValue(selectedId),
      };
      const service = new StatementCategorySuggestionsService(
        {
          findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
            categories,
            examples: [],
          }),
          findActiveCategoryInSpace: jest.fn().mockResolvedValue(categories[0]),
        },
        evaluator,
      );

      await expect(
        service.suggestInSpace('7', 'Market purchase'),
      ).resolves.toBeNull();
    },
  );

  it('keeps suggestion failures optional', async () => {
    const service = new StatementCategorySuggestionsService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories,
          examples: [],
        }),
        findActiveCategoryInSpace: jest.fn().mockResolvedValue(categories[0]),
      },
      {
        suggestCategory: jest.fn().mockRejectedValue(new Error('Unavailable')),
      },
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toBeNull();
  });

  it('does not call the evaluator when the Space has no active Categories', async () => {
    const suggestCategory = createSuggestCategoryEvaluator();
    const evaluator: CategorySuggestionEvaluator = {
      suggestCategory,
    };
    const service = new StatementCategorySuggestionsService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories: [],
          examples: [],
        }),
        findActiveCategoryInSpace: jest.fn().mockResolvedValue(null),
      },
      evaluator,
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toBeNull();
    expect(suggestCategory).not.toHaveBeenCalled();
  });
});

function createSuggestCategoryEvaluator() {
  type SuggestCategory = CategorySuggestionEvaluator['suggestCategory'];
  return jest.fn<ReturnType<SuggestCategory>, Parameters<SuggestCategory>>();
}
