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

describe('Statement import OpenAPI contract', () => {
  it('describes committed-import success responses and history pages', async () => {
    const document = await createOpenApiDocument();
    const collectionPath =
      document.paths[`/${API_PREFIX}/users/me/statement-imports`];
    const itemPath =
      document.paths[
        `/${API_PREFIX}/users/me/statement-imports/{statementImportId}`
      ];
    const createOperation = collectionPath?.post as OperationObject;
    const listOperation = collectionPath?.get as OperationObject;
    const getOperation = itemPath?.get as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Statement imports',
      description: 'Reviewed import commits and history.',
    });
    expect(createOperation).toMatchObject({
      operationId: 'StatementImports_commitReviewedStatementImport',
      tags: ['Statement imports'],
      summary: 'Commit an already parsed and reviewed statement atomically.',
    });
    expect(listOperation).toMatchObject({
      operationId: 'StatementImports_listStatementImports',
      tags: ['Statement imports'],
      summary:
        'List statement-import history in statement-date-descending, ID-descending keyset pages.',
    });
    expect(getOperation).toMatchObject({
      operationId: 'StatementImports_getStatementImport',
      tags: ['Statement imports'],
      summary: 'Get a statement import.',
    });

    expect(createOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/CommitReviewedStatementImportDto',
          },
        },
      },
    });
    expect(createOperation.responses['201']).toMatchObject({
      description: 'Statement import committed.',
      headers: {
        Location: {
          required: true,
          schema: {
            type: 'string',
            example: `/${API_PREFIX}/users/me/spaces/7/statement-imports/42`,
          },
        },
      },
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/StatementImportResponseDto',
          },
        },
      },
    });
    expect(listOperation.responses['200']).toMatchObject({
      description: 'Statement-import history page.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/StatementImportHistoryPageResponseDto',
          },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Statement import.',
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/StatementImportResponseDto',
          },
        },
      },
    });

    expect(
      document.components?.schemas?.StatementImportResponseDto,
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'fileName',
        'statementDate',
        'bank',
        'cardType',
        'importedAt',
      ],
    });
    expect(
      document.components?.schemas?.StatementImportHistoryPageResponseDto,
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['items', 'nextCursor'],
    });
    expect(
      document.components?.schemas?.StatementImportResponseDto,
    ).not.toHaveProperty('properties.userId');
    expect(
      document.components?.schemas?.StatementImportResponseDto,
    ).not.toHaveProperty('properties.fileHash');
    expect(
      document.components?.schemas?.StatementImportHistoryResponseDto,
    ).not.toHaveProperty('properties.importFingerprint');

    expectPathParameter(createOperation, undefined);
    expectPathParameter(listOperation, undefined);
    expectPathParameter(getOperation, 'statementImportId');
    expectStatementImportQueryParameters(listOperation);

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
    expectResponseReferences(createOperation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '406': 'NotAcceptableError',
      '409': 'ProbableDuplicateConflict',
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

    expectCommitRequestSchema(document);
    expectResponseSchemas(document);

    const conflictResponse = document.components?.responses
      ?.ProbableDuplicateConflict as unknown as {
      content: {
        'application/json': {
          examples: Record<string, unknown>;
        };
      };
    };
    const conflictExamples =
      conflictResponse.content['application/json'].examples;
    expect(Object.keys(conflictExamples)).toEqual(
      expect.arrayContaining([
        'fileAlreadyImported',
        'withinSubmission',
        'committedMatch',
        'categoryInactive',
      ]),
    );
    expect(conflictExamples.fileAlreadyImported).toMatchObject({
      value: {
        error: { code: 'STATEMENT_IMPORT_FILE_ALREADY_EXISTS' },
      },
    });
    expect(conflictExamples.withinSubmission).toMatchObject({
      value: {
        error: { code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES' },
      },
    });
    expect(conflictExamples.committedMatch).toMatchObject({
      value: {
        error: { code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES' },
      },
    });
    expect(conflictExamples.categoryInactive).toMatchObject({
      value: { error: { code: 'CATEGORY_INACTIVE' } },
    });
    expect(schema(document, 'ErrorResponseDto')).toMatchObject({
      properties: {
        details: {
          items: {
            oneOf: [
              { $ref: '#/components/schemas/ErrorDetailDto' },
              { $ref: '#/components/schemas/ProbableDuplicateDetailDto' },
            ],
          },
        },
      },
    });
    expect(JSON.stringify(document)).not.toContain('importFingerprint');
    expect(JSON.stringify(document)).not.toContain('ux_statement_imports');
  });
});

function expectCommitRequestSchema(document: OpenAPIObject): void {
  const commitSchema = schema(document, 'CommitReviewedStatementImportDto');
  expect(commitSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['fileName', 'fileHash', 'statementDate', 'bank', 'transactions'],
    properties: {
      fileName: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '\\S',
      },
      fileHash: {
        type: 'string',
        pattern: '^[0-9a-f]{64}$',
      },
      statementDate: {
        type: 'string',
        format: 'date',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      bank: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '\\S',
      },
      cardType: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '\\S',
        nullable: true,
      },
      transactions: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ReviewedStatementTransactionDto',
        },
      },
      acknowledgeProbableDuplicates: {
        type: 'boolean',
        default: false,
      },
    },
  });

  const transactionSchema = schema(document, 'ReviewedStatementTransactionDto');
  expect(transactionSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['purchaseDate', 'description', 'amount'],
    properties: {
      categoryId: {
        type: 'string',
        pattern: '^[1-9]\\d*$',
        nullable: true,
      },
      purchaseDate: {
        type: 'string',
        format: 'date',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
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
      categoryMatchConfidence: {
        type: 'string',
        pattern: '^(?:0(?:\\.\\d{1,4})?|1(?:\\.0{1,4})?)$',
        nullable: true,
      },
    },
  });
}

function expectResponseSchemas(document: OpenAPIObject): void {
  const responseSchema = schema(document, 'StatementImportResponseDto');
  expect(responseSchema).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'fileName',
      'statementDate',
      'bank',
      'cardType',
      'importedAt',
    ],
    properties: {
      id: { type: 'string', pattern: '^[1-9]\\d*$', example: '100' },
      fileName: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '\\S',
      },
      statementDate: {
        type: 'string',
        format: 'date',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      bank: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '\\S',
      },
      cardType: { type: 'string', nullable: true },
      importedAt: { type: 'string', format: 'date-time' },
    },
  });
  expect(responseSchema).not.toHaveProperty('properties.userId');
  expect(responseSchema).not.toHaveProperty('properties.fileHash');

  const historySchema = schema(document, 'StatementImportHistoryResponseDto');
  expect(historySchema).toMatchObject({
    required: [
      'id',
      'fileName',
      'statementDate',
      'bank',
      'cardType',
      'importedAt',
      'transactionCount',
    ],
    properties: {
      transactionCount: {
        type: 'string',
        pattern: '^\\d+$',
      },
    },
  });
  expect(historySchema).not.toHaveProperty('properties.userId');
  expect(historySchema).not.toHaveProperty('properties.fileHash');
  expect(historySchema).not.toHaveProperty('properties.importFingerprint');

  expect(
    schema(document, 'StatementImportHistoryPageResponseDto'),
  ).toMatchObject({
    type: 'object',
    additionalProperties: false,
    required: ['items', 'nextCursor'],
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/StatementImportHistoryResponseDto',
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
}

function expectStatementImportQueryParameters(
  operation: OperationObject,
): void {
  const parameters = documentParameters(operation);
  const byName = new Map(
    parameters.map((parameter) => [parameter.name, parameter]),
  );

  expect(parameters).toHaveLength(4);
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
    expect.stringContaining('same date filters'),
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

  expect(operation.parameters).toEqual([
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

function documentParameters(operation: OperationObject): ParameterObject[] {
  return (operation.parameters ?? []).filter(isParameterObject);
}

function isParameterObject(
  parameter: ParameterObject | ReferenceObject,
): parameter is ParameterObject {
  return 'name' in parameter && 'in' in parameter;
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
