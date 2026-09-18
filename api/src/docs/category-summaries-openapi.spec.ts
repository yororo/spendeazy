import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category summary OpenAPI contract', () => {
  it('describes conditional calendar inputs and aggregate response semantics', async () => {
    const document = await createOpenApiDocument();
    const operation = document.paths[
      `/${API_PREFIX}/users/me/category-summaries`
    ]?.get as OperationObject;

    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();

    expect(document.tags).toContainEqual({
      name: 'Category summaries',
      description: 'Calendar-period spending summaries.',
    });
    expect(operation).toMatchObject({
      operationId: 'CategorySummaries_getCategorySummary',
      tags: ['Category summaries'],
      summary: 'Get a complete monthly or yearly calendar-period summary.',
    });
    expect(operation.description).toEqual(
      expect.stringContaining(
        'Active categories are included even with no spending; inactive categories remain only when they have spending, and results are ordered by category ID.',
      ),
    );

    const parameters = (operation.parameters ?? []) as Array<{
      name?: unknown;
      in?: unknown;
      required?: unknown;
      description?: unknown;
      schema?: unknown;
    }>;
    expect(parameters).toHaveLength(3);
    expect(parameters).toMatchObject([
      {
        name: 'period',
        in: 'query',
        required: true,
        schema: {
          type: 'string',
          enum: ['monthly', 'yearly'],
          example: 'monthly',
        },
      },
      {
        name: 'year',
        in: 'query',
        required: true,
        schema: { type: 'string', pattern: '^\\d{4}$', example: '2026' },
      },
      {
        name: 'month',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          pattern: '^(0[1-9]|1[0-2])$',
          example: '08',
        },
      },
    ]);
    expect(parameters[0]?.description).toEqual(
      expect.stringContaining(
        'Monthly summaries require month and yearly summaries do not accept month.',
      ),
    );
    expect(parameters[1]?.description).toBe(
      'Four-digit calendar year used for the summary.',
    );
    expect(parameters[2]?.description).toEqual(
      expect.stringContaining(
        'Required for monthly summaries; forbidden for yearly summaries.',
      ),
    );

    expect(operation.responses['200']).toMatchObject({
      description: 'Category summary.',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CategorySummaryResponseDto' },
        },
      },
    });
    expectResponseStatuses(operation, [
      '200',
      '400',
      '401',
      '403',
      '406',
      '500',
    ]);
    expectResponseReferences(operation, {
      '400': 'ValidationError',
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '406': 'NotAcceptableError',
      '500': 'InternalError',
    });

    const summarySchema = schema(document, 'CategorySummaryResponseDto');
    expect(summarySchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'period',
        'year',
        'month',
        'categories',
        'uncategorizedTotal',
        'uncategorizedCount',
      ],
      properties: {
        period: { type: 'string', enum: ['monthly', 'yearly'] },
        year: { type: 'string', pattern: '^\\d{4}$' },
        month: {
          type: 'string',
          pattern: '^(0[1-9]|1[0-2])$',
          nullable: true,
        },
        categories: {
          type: 'array',
          items: {
            $ref: '#/components/schemas/CategorySummaryItemResponseDto',
          },
        },
        uncategorizedTotal: {
          type: 'string',
          pattern: '^\\d+\\.\\d{2}$',
        },
        uncategorizedCount: { type: 'string', pattern: '^\\d+$' },
      },
    });

    const itemSchema = schema(document, 'CategorySummaryItemResponseDto');
    expect(itemSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'categoryId',
        'name',
        'isActive',
        'totalAmount',
        'transactionCount',
        'budgetAmount',
        'remainingAmount',
      ],
      properties: {
        categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '\\S',
        },
        isActive: { type: 'boolean' },
        totalAmount: {
          type: 'string',
          pattern: '^\\d+\\.\\d{2}$',
        },
        transactionCount: { type: 'string', pattern: '^\\d+$' },
        budgetAmount: {
          type: 'string',
          pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
          nullable: true,
        },
        remainingAmount: {
          type: 'string',
          pattern: '^-?\\d+\\.\\d{2}$',
          nullable: true,
        },
      },
    });
    expect(itemSchema).not.toHaveProperty('properties.userId');
    expect(itemSchema).not.toHaveProperty('properties.description');
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

function schema(
  document: OpenAPIObject,
  name: string,
): Record<string, unknown> {
  return document.components?.schemas?.[name] as Record<string, unknown>;
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
