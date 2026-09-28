import type {
  CategorySuggestionCatalogStore,
  CategorySuggestionCandidate,
  CategorySuggestionDistribution,
  CategorySuggestionEvaluator,
} from './statement-category-suggestions';
import { StatementCategorySuggestionsService } from './statement-category-suggestions.service';

describe('StatementCategorySuggestionsService', () => {
  const categories: readonly CategorySuggestionCandidate[] = [
    { id: '42', name: 'Groceries', description: 'Food and household supplies' },
    { id: '43', name: 'Transport', description: null },
    { id: '44', name: 'Dining', description: 'Prepared meals' },
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
      .mockImplementation((_spaceId: string, categoryId: string) =>
        Promise.resolve(categories.find(({ id }) => id === categoryId) ?? null),
      );
    const suggestCategory = createSuggestCategoryEvaluator().mockResolvedValue(
      distribution('42', {
        '42': 0.65,
        '43': 0.1,
        '44': 0.05,
        none_of_the_above: 0.2,
      }),
    );
    const service = createService(
      { findSuggestionCatalogInSpace, findActiveCategoryInSpace },
      { suggestCategory },
    );

    await expect(
      service.suggestInSpace('7', '  Market purchase  '),
    ).resolves.toEqual([{ categoryId: '42', categoryName: 'Groceries' }]);

    expect(findSuggestionCatalogInSpace).toHaveBeenCalledWith('7');
    expect(findActiveCategoryInSpace).toHaveBeenCalledWith('7', '42');
    expect(suggestCategory).toHaveBeenCalledWith(
      'Market purchase',
      categories,
      [{ categoryId: '42', description: 'Metro Market North' }],
    );
  });

  it('keeps active Category names available when history has no useful examples', async () => {
    const suggestCategory = createSuggestCategoryEvaluator().mockResolvedValue(
      distribution('42', {
        '42': 0.65,
        '43': 0.1,
        '44': 0.05,
        none_of_the_above: 0.2,
      }),
    );
    const service = createService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories,
          examples: [
            { categoryId: '43', description: 'Bus route to the office' },
          ],
        }),
        findActiveCategoryInSpace: jest
          .fn()
          .mockImplementation((_spaceId: string, categoryId: string) =>
            Promise.resolve(
              categories.find(({ id }) => id === categoryId) ?? null,
            ),
          ),
      },
      { suggestCategory },
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toEqual([{ categoryId: '42', categoryName: 'Groceries' }]);
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
    const suggestCategory = createSuggestCategoryEvaluator().mockResolvedValue(
      distribution('none_of_the_above', { none_of_the_above: 1 }),
    );
    const service = createService(
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
    const probabilities: Record<string, number> = Object.fromEntries(
      manyCategories.map(({ id }) => [id, 0]),
    );
    probabilities.none_of_the_above = 1;
    const suggestCategory = createSuggestCategoryEvaluator().mockResolvedValue(
      distribution('none_of_the_above', probabilities),
    );
    const service = createService(
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

  it.each([
    {
      count: 0,
      result: distribution('none_of_the_above', {
        '42': 0.2,
        '43': 0.1,
        '44': 0.1,
        none_of_the_above: 0.6,
      }),
      expected: [],
    },
    {
      count: 1,
      result: distribution('42', {
        '42': 0.7,
        '43': 0.15,
        '44': 0.1,
        none_of_the_above: 0.05,
      }),
      expected: [{ categoryId: '42', categoryName: 'Groceries' }],
    },
    {
      count: 2,
      result: distribution('42', {
        '42': 0.6,
        '43': 0.3,
        '44': 0.1,
        none_of_the_above: 0,
      }),
      expected: [
        { categoryId: '42', categoryName: 'Groceries' },
        { categoryId: '43', categoryName: 'Transport' },
      ],
    },
    {
      count: 3,
      result: distribution('42', {
        '42': 0.5,
        '43': 0.25,
        '44': 0.25,
        none_of_the_above: 0,
      }),
      expected: [
        { categoryId: '42', categoryName: 'Groceries' },
        { categoryId: '43', categoryName: 'Transport' },
        { categoryId: '44', categoryName: 'Dining' },
      ],
    },
  ])(
    'returns $count calibrated, distinct suggestions',
    async ({ result, expected }) => {
      const service = createService(
        {
          findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
            categories,
            examples: [],
          }),
          findActiveCategoryInSpace: jest
            .fn()
            .mockImplementation((_spaceId: string, categoryId: string) =>
              Promise.resolve(
                categories.find(({ id }) => id === categoryId) ?? null,
              ),
            ),
        },
        { suggestCategory: jest.fn().mockResolvedValue(result) },
      );

      await expect(
        service.suggestInSpace('7', 'Market purchase'),
      ).resolves.toEqual(expected);
    },
  );

  it('drops duplicate catalog IDs and rechecks active status before returning results', async () => {
    const duplicateCategories = [
      categories[0],
      categories[0],
      ...categories.slice(1),
    ];
    const suggestCategory = createSuggestCategoryEvaluator().mockResolvedValue(
      distribution('42', {
        '42': 0.5,
        '43': 0.25,
        '44': 0.25,
        none_of_the_above: 0,
      }),
    );
    const findActiveCategoryInSpace = jest
      .fn()
      .mockImplementation((_spaceId: string, categoryId: string) =>
        Promise.resolve(
          categoryId === '43'
            ? null
            : (categories.find(({ id }) => id === categoryId) ?? null),
        ),
      );
    const service = createService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories: duplicateCategories,
          examples: [],
        }),
        findActiveCategoryInSpace,
      },
      { suggestCategory },
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toEqual([
      { categoryId: '42', categoryName: 'Groceries' },
      { categoryId: '44', categoryName: 'Dining' },
    ]);
    expect(suggestCategory).toHaveBeenCalledWith(
      'Market purchase',
      categories,
      [],
    );
    expect(findActiveCategoryInSpace).toHaveBeenCalledWith('7', '43');
    expect(findActiveCategoryInSpace).toHaveBeenCalledTimes(3);
    expect(findActiveCategoryInSpace).toHaveBeenNthCalledWith(1, '7', '42');
    expect(findActiveCategoryInSpace).toHaveBeenNthCalledWith(2, '7', '43');
    expect(findActiveCategoryInSpace).toHaveBeenNthCalledWith(3, '7', '44');
  });

  it('discards unknown IDs from a returned distribution', async () => {
    const service = createService(
      {
        findSuggestionCatalogInSpace: jest.fn().mockResolvedValue({
          categories,
          examples: [],
        }),
        findActiveCategoryInSpace: jest
          .fn()
          .mockImplementation((_spaceId: string, categoryId: string) =>
            Promise.resolve(
              categories.find(({ id }) => id === categoryId) ?? null,
            ),
          ),
      },
      {
        suggestCategory: jest.fn().mockResolvedValue(
          distribution('42', {
            '42': 0.5,
            '43': 0.25,
            '44': 0.25,
            '999': 0,
            none_of_the_above: 0,
          }),
        ),
      },
    );

    await expect(
      service.suggestInSpace('7', 'Market purchase'),
    ).resolves.toHaveLength(3);
  });

  it('keeps suggestion failures optional', async () => {
    const service = createService(
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
    ).resolves.toEqual([]);
  });

  it('does not call the evaluator when description or active Categories are missing', async () => {
    const suggestCategory = createSuggestCategoryEvaluator();
    const evaluator = { suggestCategory };
    const noCategories = createService(
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
      noCategories.suggestInSpace('7', 'Market purchase'),
    ).resolves.toEqual([]);
    await expect(noCategories.suggestInSpace('7', '  ')).resolves.toEqual([]);
    expect(suggestCategory).not.toHaveBeenCalled();
  });
});

function createService(
  catalogStore: CategorySuggestionCatalogStore,
  evaluator: CategorySuggestionEvaluator,
): StatementCategorySuggestionsService {
  return new StatementCategorySuggestionsService(catalogStore, evaluator);
}

function distribution(
  choice: string,
  probabilities: Readonly<Record<string, number>>,
): CategorySuggestionDistribution {
  return { choice, probabilities };
}

function createSuggestCategoryEvaluator() {
  type SuggestCategory = CategorySuggestionEvaluator['suggestCategory'];
  return jest.fn<ReturnType<SuggestCategory>, Parameters<SuggestCategory>>();
}
