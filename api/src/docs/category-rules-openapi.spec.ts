import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category Rule OpenAPI contract', () => {
  it('describes exact matching, category reassignment, and every rule operation', async () => {
    const document = await createOpenApiDocument();
    const collectionPath =
      document.paths[`/${API_PREFIX}/users/me/category-rules`];
    const itemPath =
      document.paths[`/${API_PREFIX}/users/me/category-rules/{ruleId}`];
    const createOperation = collectionPath?.post as OperationObject;
    const listOperation = collectionPath?.get as OperationObject;
    const getOperation = itemPath?.get as OperationObject;
    const updateOperation = itemPath?.patch as OperationObject;
    const deleteOperation = itemPath?.delete as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Category rules',
      description: 'Exact-description rules.',
    });
    expect(createOperation).toMatchObject({
      operationId: 'CategoryRules_createCategoryRule',
      tags: ['Category rules'],
      summary: 'Create a category rule.',
      description:
        'Matching normalizes surrounding and repeated whitespace and compares case-insensitively.',
    });
    expect(listOperation).toMatchObject({
      operationId: 'CategoryRules_listCategoryRules',
      tags: ['Category rules'],
      summary: 'List all owned category rules in ascending ID order.',
    });
    expect(getOperation).toMatchObject({
      operationId: 'CategoryRules_getCategoryRule',
      tags: ['Category rules'],
      summary: 'Get a category rule.',
    });
    expect(updateOperation).toMatchObject({
      operationId: 'CategoryRules_updateCategoryRule',
      tags: ['Category rules'],
      summary: 'Update or reassign a category rule.',
      description:
        'A category rule may be reassigned only to an active Category; assigning it to an inactive Category returns 409 Conflict.',
    });
    expect(deleteOperation).toMatchObject({
      operationId: 'CategoryRules_deleteCategoryRule',
      tags: ['Category rules'],
      summary: 'Delete a category rule.',
    });

    expect(createOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateCategoryRuleDto' },
        },
      },
    });
    expect(updateOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpdateCategoryRuleDto' },
        },
      },
    });
    expect(listOperation.requestBody).toBeUndefined();
    expect(getOperation.requestBody).toBeUndefined();
    expect(deleteOperation.requestBody).toBeUndefined();

    expect(createOperation.responses['201']).toMatchObject({
      description: 'Category rule created.',
      headers: {
        Location: {
          required: true,
          schema: {
            type: 'string',
            example: `/${API_PREFIX}/users/me/category-rules/42`,
          },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryRuleResponseDto' },
        },
      },
    });
    expect(listOperation.responses['200']).toMatchObject({
      description: 'Category rules.',
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/CategoryRuleResponseDto' },
          },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Category rule.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryRuleResponseDto' },
        },
      },
    });
    expect(updateOperation.responses['200']).toMatchObject({
      description: 'Category rule updated.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryRuleResponseDto' },
        },
      },
    });
    expect(deleteOperation.responses['204']).toEqual({
      description: 'Category rule deleted.',
    });

    expectPathParameter(createOperation, undefined);
    expectPathParameter(listOperation, undefined);
    for (const operation of [getOperation, updateOperation, deleteOperation]) {
      expectPathParameter(operation, 'ruleId');
    }

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
    expectResponseStatuses(listOperation, ['200', '401', '403', '406', '500']);
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
      '500': 'InternalError',
    });

    const responseSchema = document.components?.schemas
      ?.CategoryRuleResponseDto as Record<string, unknown>;
    expect(responseSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'categoryId',
        'pattern',
        'matchType',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          example: '42',
        },
        pattern: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        matchType: {
          type: 'string',
          enum: ['exact', 'contains'],
          example: 'exact',
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(responseSchema).not.toHaveProperty('properties.userId');
    expect(responseSchema).not.toHaveProperty('properties.normalizedPattern');

    expect(document.components?.schemas?.CreateCategoryRuleDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['pattern', 'categoryId'],
      properties: {
        pattern: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          example: '42',
        },
      },
    });
    expect(document.components?.schemas?.UpdateCategoryRuleDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        pattern: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          pattern: '\\S',
        },
        categoryId: {
          type: 'string',
          pattern: '^[1-9]\\d*$',
          example: '42',
        },
      },
    });
  });
});

function expectPathParameter(
  operation: OperationObject,
  name: string | undefined,
): void {
  if (name === undefined) {
    expect(operation.parameters ?? []).toEqual([]);
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

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
