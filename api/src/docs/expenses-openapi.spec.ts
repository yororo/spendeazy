import SwaggerParser from '@apidevtools/swagger-parser';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
} from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Expense OpenAPI contract', () => {
  it('describes source-specific responses, pagination, and expense constraints', async () => {
    const document = await createOpenApiDocument();
    const collectionPath = document.paths[`/${API_PREFIX}/users/me/expenses`];
    const historyPath =
      document.paths[`/${API_PREFIX}/users/me/expenses/history`];
    const itemPath =
      document.paths[`/${API_PREFIX}/users/me/expenses/{expenseId}`];
    const activityPath =
      document.paths[`/${API_PREFIX}/users/me/expenses/{expenseId}/activity`];
    const createOperation = collectionPath?.post as OperationObject;
    const listOperation = collectionPath?.get as OperationObject;
    const historyOperation = historyPath?.get as OperationObject;
    const getOperation = itemPath?.get as OperationObject;
    const activityOperation = activityPath?.get as OperationObject;
    const updateOperation = itemPath?.patch as OperationObject;
    const deleteOperation = itemPath?.delete as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Expenses',
      description: 'Manual and imported expenses in a Space.',
    });
    expect(createOperation).toMatchObject({
      operationId: 'Expenses_createManualExpense',
      tags: ['Expenses'],
      summary: 'Create a manual expense.',
    });
    expect(listOperation).toMatchObject({
      operationId: 'Expenses_listExpenses',
      tags: ['Expenses'],
      summary:
        'List filtered expenses in date-descending, ID-descending keyset pages.',
    });
    expect(historyOperation).toMatchObject({
      operationId: 'Expenses_listDeletedExpenses',
      tags: ['Expenses'],
      summary: 'List retained deleted Expenses.',
    });
    expect(listOperation.description).toEqual(
      expect.stringContaining('purchaseDate descending'),
    );
    expect(listOperation.description).toEqual(
      expect.stringContaining('Unknown query parameters are rejected'),
    );
    expect(getOperation).toMatchObject({
      operationId: 'Expenses_getManualExpense',
      tags: ['Expenses'],
      summary: 'Get a manual expense.',
    });
    expect(activityOperation).toMatchObject({
      operationId: 'Expenses_listExpenseActivity',
      tags: ['Expenses'],
      summary: 'List activity for an Expense.',
    });
    expect(updateOperation).toMatchObject({
      operationId: 'Expenses_updateExpense',
      tags: ['Expenses'],
      summary: 'Update a manual expense or recategorize an imported expense.',
    });
    expect(deleteOperation).toMatchObject({
      operationId: 'Expenses_deleteManualExpense',
      tags: ['Expenses'],
      summary: 'Delete a manual expense.',
    });

    expect(createOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateManualExpenseDto' },
        },
      },
    });
    expect(updateOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpdateManualExpenseDto' },
        },
      },
    });
    expect(listOperation.requestBody).toBeUndefined();
    expect(getOperation.requestBody).toBeUndefined();
    expect(activityOperation.requestBody).toBeUndefined();
    expect(deleteOperation.requestBody).toBeUndefined();
    expect(historyOperation.requestBody).toBeUndefined();

    expect(createOperation.responses['201']).toMatchObject({
      description: 'Manual expense created.',
      headers: {
        Location: {
          required: true,
          schema: {
            type: 'string',
            example: `/${API_PREFIX}/users/me/expenses/42`,
          },
        },
      },
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ManualExpenseResponseDto',
          },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Manual expense.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ManualExpenseResponseDto',
          },
        },
      },
    });
    expect(listOperation.responses['200']).toMatchObject({
      description: 'Expense page.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ExpenseHistoryPageResponseDto',
          },
        },
      },
    });
    expect(historyOperation.responses['200']).toMatchObject({
      description: 'Retained deleted Expense history page.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ExpenseHistoryPageResponseDto',
          },
        },
      },
    });
    expect(activityOperation.responses['200']).toMatchObject({
      description: 'Expense activity events.',
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/ExpenseActivityResponseDto',
            },
          },
        },
      },
    });
    expect(updateOperation.responses['200']).toMatchObject({
      description: 'Expense updated.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              {
                $ref: '#/components/schemas/ManualExpenseResponseDto',
              },
              {
                $ref: '#/components/schemas/ImportedExpenseResponseDto',
              },
            ],
            discriminator: {
              propertyName: 'source',
              mapping: {
                manual: '#/components/schemas/ManualExpenseResponseDto',
                imported: '#/components/schemas/ImportedExpenseResponseDto',
              },
            },
          },
        },
      },
    });
    expect(deleteOperation.responses['204']).toEqual({
      description: 'Manual expense deleted.',
    });
    expect(documentParameters(deleteOperation)).toContainEqual(
      expect.objectContaining({ name: 'if-match', in: 'header' }),
    );

    expectPathParameter(createOperation, undefined);
    expectPathParameter(listOperation, undefined);
    expectPathParameter(historyOperation, undefined);
    for (const operation of [getOperation, updateOperation, deleteOperation]) {
      expectPathParameter(operation, 'expenseId');
    }
    expectPathParameter(activityOperation, 'expenseId');

    expectExpenseQueryParameters(listOperation, true);
    expectExpenseQueryParameters(historyOperation, true);
    expectResponseStatuses(createOperation, [
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
    expectResponseStatuses(listOperation, [
      '200',
      '400',
      '401',
      '403',
      '406',
      '500',
    ]);
    expectResponseStatuses(historyOperation, [
      '200',
      '400',
      '401',
      '403',
      '406',
      '500',
    ]);
    expectResponseStatuses(activityOperation, [
      '200',
      '400',
      '401',
      '403',
      '404',
      '406',
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
    expectResponseStatuses(updateOperation, [
      '200',
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
    expectResponseStatuses(deleteOperation, [
      '204',
      '400',
      '401',
      '403',
      '404',
      '406',
      '409',
      '500',
    ]);

    expectResponseReferences(createOperation, {
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
    expectResponseReferences(listOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '406': 'NotAcceptableError',
      '500': 'InternalError',
    });
    expectResponseReferences(historyOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '406': 'NotAcceptableError',
      '500': 'InternalError',
    });
    expectResponseReferences(activityOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
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
    expectResponseReferences(updateOperation, {
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
    expectResponseReferences(deleteOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
      '409': 'ConflictError',
      '500': 'InternalError',
    });

    const manualResponseSchema = schema(document, 'ManualExpenseResponseDto');
    expect(manualResponseSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'categoryId',
        'purchaseDate',
        'description',
        'amount',
        'source',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '100' },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          nullable: true,
        },
        purchaseDate: { type: 'string', format: 'date' },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        amount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
        },
        source: { type: 'string', enum: ['manual'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(manualResponseSchema).not.toHaveProperty(
      'properties.statementImportId',
    );

    const importedResponseSchema = schema(
      document,
      'ImportedExpenseResponseDto',
    );
    expect(importedResponseSchema).toMatchObject({
      properties: {
        categoryId: { type: 'string', nullable: true },
        source: { type: 'string', enum: ['imported'] },
      },
    });
    expect(importedResponseSchema).not.toHaveProperty(
      'properties.importFingerprint',
    );

    const activityResponseSchema = schema(
      document,
      'ExpenseActivityResponseDto',
    );
    expect(activityResponseSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'expenseId', 'type', 'actorUserId', 'occurredAt'],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '200' },
        expenseId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          example: '100',
        },
        type: {
          type: 'string',
          enum: ['created', 'edited', 'deleted'],
          example: 'created',
        },
        actorUserId: { type: 'string', pattern: '^[1-9]\\d*$', example: '7' },
        occurredAt: { type: 'string', format: 'date-time' },
        before: {
          allOf: [
            {
              $ref: '#/components/schemas/ExpenseActivitySnapshotDto',
            },
          ],
          description:
            'Expense values before an edit. Present only for edited events.',
        },
        after: {
          allOf: [
            {
              $ref: '#/components/schemas/ExpenseActivitySnapshotDto',
            },
          ],
          description:
            'Expense values after an edit. Present only for edited events.',
        },
      },
    });

    const pageSchema = schema(document, 'ExpenseHistoryPageResponseDto');
    expect(pageSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['totalCount', 'items', 'nextCursor'],
      properties: {
        items: {
          type: 'array',
          items: {
            oneOf: [
              {
                $ref: '#/components/schemas/ManualExpenseHistoryResponseDto',
              },
              {
                $ref: '#/components/schemas/ImportedExpenseHistoryResponseDto',
              },
            ],
            discriminator: {
              propertyName: 'source',
              mapping: {
                manual: '#/components/schemas/ManualExpenseHistoryResponseDto',
                imported:
                  '#/components/schemas/ImportedExpenseHistoryResponseDto',
              },
            },
          },
        },
        nextCursor: {
          type: 'string',
          minLength: 1,
          pattern: '^[A-Za-z0-9_-]+$',
          nullable: true,
        },
      },
    });

    const manualHistorySchema = schema(
      document,
      'ManualExpenseHistoryResponseDto',
    );
    expect(manualHistorySchema.required).toEqual(
      expect.arrayContaining(['statementImportId']),
    );
    expect(manualHistorySchema).toMatchObject({
      properties: {
        statementImportId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          nullable: true,
          enum: [null],
        },
      },
    });
    const importedHistorySchema = schema(
      document,
      'ImportedExpenseHistoryResponseDto',
    );
    expect(importedHistorySchema.required).toEqual(
      expect.arrayContaining(['statementImportId']),
    );
    expect(importedHistorySchema).toMatchObject({
      properties: {
        statementImportId: { type: 'string', pattern: '^[1-9]\\d*$' },
      },
    });

    expect(document.components?.schemas?.CreateManualExpenseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['purchaseDate', 'description', 'amount'],
      properties: {
        purchaseDate: { type: 'string', format: 'date' },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        amount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
        },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          nullable: true,
        },
      },
    });
    expect(document.components?.schemas?.UpdateManualExpenseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        purchaseDate: { type: 'string', format: 'date' },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        amount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
        },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          nullable: true,
        },
      },
    });
  });
});

function expectExpenseQueryParameters(
  operation: OperationObject,
  hasSearchFilters = false,
): void {
  const parameters = documentParameters(operation);
  const byName = new Map(
    parameters.map((parameter) => [parameter.name, parameter]),
  );

  expect(parameters).toHaveLength(hasSearchFilters ? 11 : 8);
  if (hasSearchFilters) {
    expect(byName.get('description')).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'string', minLength: 1, maxLength: 500 },
    });
    expect(byName.get('accountBank')).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'string' },
    });
    expect(byName.get('accountCardType')).toMatchObject({
      in: 'query',
      required: false,
      schema: { type: 'string' },
    });
  }
  expect(byName.get('fromDate')).toMatchObject({
    in: 'query',
    required: false,
    schema: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
  });
  expect(byName.get('toDate')).toMatchObject({
    in: 'query',
    required: false,
    schema: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
  });
  expect(byName.get('categoryId')).toMatchObject({
    in: 'query',
    required: false,
    schema: { type: 'string', pattern: '^[1-9]\\d*$' },
  });
  expect(byName.get('categoryState')).toMatchObject({
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['categorized', 'uncategorized'] },
  });
  expect(byName.get('statementImportId')).toMatchObject({
    in: 'query',
    required: false,
    schema: { type: 'string', pattern: '^[1-9]\\d*$' },
  });
  expect(byName.get('source')).toMatchObject({
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['manual', 'imported'] },
  });
  expect(byName.get('pageSize')).toMatchObject({
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  });
  expect(byName.get('cursor')).toMatchObject({
    in: 'query',
    required: false,
    schema: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z0-9_-]+$',
    },
  });
  expect(byName.get('fromDate')?.description).toEqual(
    expect.stringContaining('on or before'),
  );
  expect(byName.get('cursor')?.description).toEqual(
    expect.stringContaining('same filters'),
  );
}

function expectPathParameter(
  operation: OperationObject,
  name: string | undefined,
): void {
  if (name === undefined) {
    expect(
      documentParameters(operation).filter(
        (parameter) => parameter.in === 'path',
      ),
    ).toEqual([]);
    return;
  }

  expect(
    documentParameters(operation).filter(
      (parameter) => parameter.in === 'path',
    ),
  ).toEqual([
    {
      name,
      in: 'path',
      required: true,
      description:
        'Positive bigint identifier encoded as a decimal JSON string.',
      schema: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
    },
  ]);
}

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

function schema(
  document: OpenAPIObject,
  name: string,
): Record<string, unknown> {
  return document.components?.schemas?.[name] as Record<string, unknown>;
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}

function documentParameters(operation: OperationObject): ParameterObject[] {
  return (operation.parameters ?? []).filter(isParameterObject);
}

function isParameterObject(
  parameter: ParameterObject | ReferenceObject,
): parameter is ParameterObject {
  return 'name' in parameter && 'in' in parameter;
}
