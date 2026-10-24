import type { OpenAPIObject } from '@nestjs/swagger';
import { createOpenApiDocument } from '../src/docs/openapi-document.factory';

describe('generated Expense HTTP contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await createOpenApiDocument();
  });

  it('exposes the canonical Space Expense operations and no saved Transaction aliases', () => {
    const paths = document.paths;
    const base = '/api/v1/users/me/spaces/{spaceId}/expenses';

    expect(paths[base]?.get?.operationId).toBe('SpaceExpenses_listExpenses');
    expect(paths[base]?.post?.operationId).toBe('SpaceExpenses_createExpense');
    expect(paths[`${base}/deleted`]?.get).toBeDefined();
    expect(paths[`${base}/{expenseId}`]?.get).toBeDefined();
    expect(paths[`${base}/{expenseId}`]?.patch).toBeDefined();
    expect(paths[`${base}/{expenseId}`]?.delete).toBeDefined();
    expect(paths[`${base}/{expenseId}/activity`]?.get).toBeDefined();
    expect(paths['/api/v1/users/me/transactions']).toBeUndefined();
    expect(
      paths['/api/v1/users/me/spaces/{spaceId}/transactions'],
    ).toBeUndefined();
    expect(paths).not.toHaveProperty(
      '/api/v1/users/me/spaces/{spaceId}/statement-imports/category-suggestions',
    );

    const schemas = document.components?.schemas ?? {};
    expect(schemas).toHaveProperty('ManualExpenseResponseDto');
    expect(schemas).toHaveProperty('ImportedExpenseHistoryResponseDto');
    expect(schemas).not.toHaveProperty('ManualTransactionResponseDto');
    expect(schemas).not.toHaveProperty(
      'StatementCategorySuggestionResponseDto',
    );
  });
});
