import { loadAppConfig } from '../config/app-config';
import type { CategorySuggestionEvaluator } from './application/statement-category-suggestions';
import { StatementImportsModule } from './statement-imports.module';

describe('StatementImportsModule', () => {
  it('restricts Category Suggestion evaluator overrides to test composition', () => {
    const evaluator: CategorySuggestionEvaluator = {
      suggestCategory: jest.fn().mockResolvedValue(null),
    };

    expect(() =>
      StatementImportsModule.register(
        true,
        { categorySuggestionEvaluator: evaluator },
        loadAppConfig({ NODE_ENV: 'development' }),
      ),
    ).toThrow(
      'Category Suggestion evaluator overrides are only available in the test environment',
    );

    expect(() =>
      StatementImportsModule.register(
        true,
        { categorySuggestionEvaluator: evaluator },
        loadAppConfig({ NODE_ENV: 'test' }),
      ),
    ).not.toThrow();
  });
});
