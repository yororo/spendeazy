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

describe('Transaction OpenAPI contract', () => {
  it('describes source-specific responses, pagination, and transaction constraints', async () => {
    const document = await createOpenApiDocument();
    const collectionPath =
      document.paths[`/${API_PREFIX}/users/me/transactions`];
    const itemPath =
      document.paths[`/${API_PREFIX}/users/me/transactions/{transactionId}`];
    const createOperation = collectionPath?.post as OperationObject;
    const listOperation = collectionPath?.get as OperationObject;
    const getOperation = itemPath?.get as OperationObject;
    const updateOperation = itemPath?.patch as OperationObject;
    const deleteOperation = itemPath?.delete as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Transactions',
      description: 'Manual and imported expenses.',
    });
    expect(createOperation).toMatchObject({
      operationId: 'Transactions_createManualTransaction',
      tags: ['Transactions'],
      summary: 'Create a manual transaction.',
    });
    expect(listOperation).toMatchObject({
      operationId: 'Transactions_listTransactions',
      tags: ['Transactions'],
      summary:
        'List filtered transactions in date-descending, ID-descending keyset pages.',
    });
    expect(listOperation.description).toEqual(
      expect.stringContaining('purchaseDate descending'),
    );
    expect(listOperation.description).toEqual(
      expect.stringContaining('Unknown query parameters are rejected'),
    );
    expect(getOperation).toMatchObject({
      operationId: 'Transactions_getManualTransaction',
      tags: ['Transactions'],
      summary: 'Get a manual transaction.',
    });
    expect(updateOperation).toMatchObject({
      operationId: 'Transactions_updateTransaction',
      tags: ['Transactions'],
      summary:
        'Update a manual transaction or recategorize an imported transaction.',
    });
    expect(deleteOperation).toMatchObject({
      operationId: 'Transactions_deleteManualTransaction',
      tags: ['Transactions'],
      summary: 'Delete a manual transaction.',
    });

    expect(createOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateManualTransactionDto' },
        },
      },
    });
    expect(updateOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpdateManualTransactionDto' },
        },
      },
    });
    expect(listOperation.requestBody).toBeUndefined();
    expect(getOperation.requestBody).toBeUndefined();
    expect(deleteOperation.requestBody).toBeUndefined();

    expect(createOperation.responses['201']).toMatchObject({
      description: 'Manual transaction created.',
      headers: {
        Location: {
          required: true,
          schema: {
            type: 'string',
            example: `/${API_PREFIX}/users/me/transactions/42`,
          },
        },
      },
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ManualTransactionResponseDto',
          },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Manual transaction.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/ManualTransactionResponseDto',
          },
        },
      },
    });
    expect(listOperation.responses['200']).toMatchObject({
      description: 'Transaction page.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/TransactionHistoryPageResponseDto',
          },
        },
      },
    });
    expect(updateOperation.responses['200']).toMatchObject({
      description: 'Transaction updated.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              {
                $ref: '#/components/schemas/ManualTransactionResponseDto',
              },
              {
                $ref: '#/components/schemas/ImportedTransactionResponseDto',
              },
            ],
            discriminator: {
              propertyName: 'source',
              mapping: {
                manual: '#/components/schemas/ManualTransactionResponseDto',
                imported: '#/components/schemas/ImportedTransactionResponseDto',
              },
            },
          },
        },
      },
    });
    expect(deleteOperation.responses['204']).toEqual({
      description: 'Manual transaction deleted.',
    });
    expect(documentParameters(deleteOperation)).toContainEqual(
      expect.objectContaining({ name: 'if-match', in: 'header' }),
    );

    expectPathParameter(createOperation, undefined);
    expectPathParameter(listOperation, undefined);
    for (const operation of [getOperation, updateOperation, deleteOperation]) {
      expectPathParameter(operation, 'transactionId');
    }

    expectTransactionQueryParameters(listOperation);
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

    const manualResponseSchema = schema(
      document,
      'ManualTransactionResponseDto',
    );
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
      'ImportedTransactionResponseDto',
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

    const pageSchema = schema(document, 'TransactionHistoryPageResponseDto');
    expect(pageSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['items', 'nextCursor'],
      properties: {
        items: {
          type: 'array',
          items: {
            oneOf: [
              {
                $ref: '#/components/schemas/ManualTransactionHistoryResponseDto',
              },
              {
                $ref: '#/components/schemas/ImportedTransactionHistoryResponseDto',
              },
            ],
            discriminator: {
              propertyName: 'source',
              mapping: {
                manual:
                  '#/components/schemas/ManualTransactionHistoryResponseDto',
                imported:
                  '#/components/schemas/ImportedTransactionHistoryResponseDto',
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
      'ManualTransactionHistoryResponseDto',
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
      'ImportedTransactionHistoryResponseDto',
    );
    expect(importedHistorySchema.required).toEqual(
      expect.arrayContaining(['statementImportId']),
    );
    expect(importedHistorySchema).toMatchObject({
      properties: {
        statementImportId: { type: 'string', pattern: '^[1-9]\\d*$' },
      },
    });

    expect(
      document.components?.schemas?.CreateManualTransactionDto,
    ).toMatchObject({
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
    expect(
      document.components?.schemas?.UpdateManualTransactionDto,
    ).toMatchObject({
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

function expectTransactionQueryParameters(operation: OperationObject): void {
  const parameters = documentParameters(operation);
  const byName = new Map(
    parameters.map((parameter) => [parameter.name, parameter]),
  );

  expect(parameters).toHaveLength(8);
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
