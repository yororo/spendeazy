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
    const findActiveCategoriesInSpace = jest.fn().mockResolvedValue(categories);
    const findActiveCategoryInSpace = jest
      .fn()
      .mockResolvedValue(categories[0]);
    const suggestCategory = jest.fn().mockResolvedValue('42');
    const catalogStore: CategorySuggestionCatalogStore = {
      findActiveCategoriesInSpace,
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

    expect(findActiveCategoriesInSpace).toHaveBeenCalledWith('7');
    expect(findActiveCategoryInSpace).toHaveBeenCalledWith('7', '42');
    expect(suggestCategory).toHaveBeenCalledWith('Market purchase', categories);
  });

  it.each(['none_of_the_above', '999'])(
    'returns no suggestion when the evaluator selects %s',
    async (selectedId) => {
      const evaluator: CategorySuggestionEvaluator = {
        suggestCategory: jest.fn().mockResolvedValue(selectedId),
      };
      const service = new StatementCategorySuggestionsService(
        {
          findActiveCategoriesInSpace: jest.fn().mockResolvedValue(categories),
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
        findActiveCategoriesInSpace: jest.fn().mockResolvedValue(categories),
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
    const suggestCategory = jest.fn();
    const evaluator: CategorySuggestionEvaluator = {
      suggestCategory,
    };
    const service = new StatementCategorySuggestionsService(
      {
        findActiveCategoriesInSpace: jest.fn().mockResolvedValue([]),
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
