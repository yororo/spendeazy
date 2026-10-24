import SwaggerParser from '@apidevtools/swagger-parser';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Expense OpenAPI contract', () => {
  it('documents revision-bound Expense routes and strict canonical fields', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const base = '/api/v1/users/me/spaces/{spaceId}/expenses';
    const collection = document.paths[base];
    const item = document.paths[base + '/{expenseId}'];
    expect(collection?.get).toBeDefined();
    expect(collection?.post).toBeDefined();
    expect(document.paths[base + '/deleted']?.get).toBeDefined();
    expect(document.paths[base + '/{expenseId}/activity']?.get).toBeDefined();
    expect(item?.get).toBeDefined();
    expect(item?.patch).toBeDefined();
    expect(item?.delete).toBeDefined();
    expect(document.paths['/api/v1/users/me/transactions']).toBeUndefined();
    expect(document.components?.schemas?.CreateManualExpenseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['expenseDate', 'description', 'amount', 'categoryId'],
    });
    expect(document.components?.schemas?.UpdateSpaceExpenseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['expectedRevision'],
    });
    const manualExpense =
      document.components?.schemas?.ManualExpenseResponseDto;
    expect(manualExpense).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(manualExpense?.required).toEqual(
      expect.arrayContaining(['categoryId', 'expenseDate', 'revision']),
    );
    expect(
      document.components?.schemas?.ExpenseHistoryPageResponseDto,
    ).toMatchObject({
      properties: {
        totalCount: { type: 'string' },
        totalAmount: { type: 'string' },
        expenses: { type: 'array' },
      },
    });
  });
});
