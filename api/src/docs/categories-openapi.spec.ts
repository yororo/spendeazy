import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { CATEGORY_COLORS } from '../categories/application/category-color';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category OpenAPI contract', () => {
  it('describes Category collection and item operations from feature DTOs', async () => {
    const document = await createOpenApiDocument();
    const collectionPath = document.paths['/api/v1/users/me/categories'];
    const itemPath = document.paths['/api/v1/users/me/categories/{categoryId}'];
    const createOperation = collectionPath?.post as OperationObject;
    const listOperation = collectionPath?.get as OperationObject;
    const getOperation = itemPath?.get as OperationObject;
    const updateOperation = itemPath?.patch as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Categories',
      description: 'Active and historical categories.',
    });
    expect(createOperation).toMatchObject({
      operationId: 'Categories_createCategory',
      tags: ['Categories'],
      summary: 'Create a category.',
      description:
        'Category names are trimmed before storage and uniqueness checking; uniqueness is case-insensitive.',
    });
    expect(listOperation).toMatchObject({
      operationId: 'Categories_listCategories',
      tags: ['Categories'],
      summary: 'List all owned categories in ascending ID order.',
    });
    expect(getOperation).toMatchObject({
      operationId: 'Categories_getCategory',
      tags: ['Categories'],
      summary: 'Get a category.',
    });
    expect(updateOperation).toMatchObject({
      operationId: 'Categories_updateCategory',
      tags: ['Categories'],
      summary: 'Edit or activate/deactivate a category.',
      description:
        'Inactive Categories retain their historical relationships and cannot receive a new Budget, although an existing Budget may still be replaced.',
    });

    expect(createOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateCategoryDto' },
        },
      },
    });
    expect(updateOperation.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UpdateCategoryDto' },
        },
      },
    });

    expect(createOperation.responses['201']).toMatchObject({
      description: 'Category created.',
      headers: {
        Location: {
          required: true,
          schema: { type: 'string', example: '/api/v1/users/me/categories/42' },
        },
      },
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryResponseDto' },
        },
      },
    });
    expect(listOperation.responses['200']).toMatchObject({
      description: 'Categories.',
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/CategoryResponseDto' },
          },
        },
      },
    });
    expect(getOperation.responses['200']).toMatchObject({
      description: 'Category.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryResponseDto' },
        },
      },
    });
    expect(updateOperation.responses['200']).toMatchObject({
      description: 'Category updated.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategoryResponseDto' },
        },
      },
    });

    expectPathParameter(getOperation, 'categoryId');
    expectPathParameter(updateOperation, 'categoryId');
    expectPathParameter(createOperation, undefined);
    expectPathParameter(listOperation, undefined);

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

    const categorySchema = document.components?.schemas
      ?.CategoryResponseDto as Record<string, unknown>;
    expect(categorySchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'name',
        'description',
        'color',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
        name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
        description: { type: 'string', nullable: true, maxLength: 500 },
        color: { type: 'string', enum: [...CATEGORY_COLORS] },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(categorySchema).not.toHaveProperty('properties.userId');

    expect(document.components?.schemas?.CreateCategoryDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
        description: { type: 'string', nullable: true, maxLength: 500 },
        color: { type: 'string', enum: [...CATEGORY_COLORS] },
      },
    });
    expect(document.components?.schemas?.UpdateCategoryDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
        description: { type: 'string', nullable: true, maxLength: 500 },
        color: { type: 'string', enum: [...CATEGORY_COLORS] },
        isActive: { type: 'boolean' },
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
