import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Budget OpenAPI contract', () => {
  it('describes replacement, retrieval, and deletion semantics from feature DTOs', async () => {
    const document = await createOpenApiDocument();
    const budgetPath =
      document.paths['/api/v1/users/me/categories/{categoryId}/budget'];
    const putOperation = budgetPath?.put as OperationObject;
    const getOperation = budgetPath?.get as OperationObject;
    const deleteOperation = budgetPath?.delete as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Budgets',
      description: 'Recurring category budgets.',
    });
    expect(putOperation).toMatchObject({
      operationId: 'Budgets_putBudget',
      tags: ['Budgets'],
      summary: 'Create or replace the category budget.',
      description:
        'A new Budget returns 201 with Location; replacing an existing Budget returns 200. An inactive Category cannot receive a new Budget, although an existing Budget may still be replaced.',
    });
    expect(getOperation).toMatchObject({
      operationId: 'Budgets_getBudget',
      tags: ['Budgets'],
      summary: 'Get a category budget.',
    });
    expect(deleteOperation).toMatchObject({
      operationId: 'Budgets_deleteBudget',
      tags: ['Budgets'],
      summary: 'Delete a category budget.',
    });

    for (const operation of [putOperation, getOperation, deleteOperation]) {
      expect(operation.parameters).toEqual([
        {
          name: 'categoryId',
          in: 'path',
          required: true,
          description:
            'Positive bigint identifier encoded as a decimal JSON string.',
          schema: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
        },
      ]);
    }

    expect(putOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpsertBudgetDto' },
        },
      },
    });
    expect(getOperation.requestBody).toBeUndefined();
    expect(deleteOperation.requestBody).toBeUndefined();

    expect(putOperation.responses['200']).toMatchObject({
      description: 'Budget replaced.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/BudgetResponseDto' },
        },
      },
    });
    expect(putOperation.responses['200']).not.toHaveProperty('headers');
    expect(putOperation.responses['201']).toMatchObject({
      description: 'Budget created.',
      headers: {
        Location: {
          required: true,
          schema: {
            type: 'string',
            example: '/api/v1/users/me/categories/42/budget',
          },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/BudgetResponseDto' },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Budget.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/BudgetResponseDto' },
        },
      },
    });
    expect(deleteOperation.responses['204']).toEqual({
      description: 'Budget deleted.',
    });

    expectResponseStatuses(putOperation, [
      '200',
      '201',
      '400',
      '401',
      '403',
      '404',
      '406',
      '409',
      '413',
      '415',
      '500',
    ]);
    expectResponseStatuses(getOperation, [
      '200',
      '400',
      '401',
      '403',
      '404',
      '406',
      '500',
    ]);
    expectResponseStatuses(deleteOperation, [
      '204',
      '400',
      '401',
      '403',
      '404',
      '406',
      '500',
    ]);

    expectResponseReferences(putOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
      '409': 'ConflictError',
      '413': 'HttpError',
      '415': 'UnsupportedMediaTypeError',
      '500': 'InternalError',
    });
    expectResponseReferences(getOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
      '500': 'InternalError',
    });
    expectResponseReferences(deleteOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
      '500': 'InternalError',
    });

    const budgetSchema = document.components?.schemas
      ?.BudgetResponseDto as Record<string, unknown>;
    expect(budgetSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'categoryId',
        'amount',
        'period',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '100' },
        categoryId: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
        amount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
          example: '250.00',
        },
        period: { type: 'string', enum: ['monthly', 'yearly'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(budgetSchema).not.toHaveProperty('properties.userId');

    expect(document.components?.schemas?.UpsertBudgetDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['amount', 'period'],
      properties: {
        amount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
        },
        period: { type: 'string', enum: ['monthly', 'yearly'] },
      },
    });
  });
});

function expectResponseStatuses(
  operation: OperationObject,
  statuses: string[],
): void {
  expect(Object.keys(operation.responses).sort()).toEqual([...statuses].sort());
}

function expectResponseReferences(
  operation: OperationObject,
  expected: Record<string, string>,
): void {
  for (const [status, responseName] of Object.entries(expected)) {
    expect(operation.responses[status]).toEqual({
      $ref: `#/components/responses/${responseName}`,
    });
  }
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
