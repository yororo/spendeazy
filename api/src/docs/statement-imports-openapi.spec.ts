import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Statement import OpenAPI contract', () => {
  it('publishes the canonical Space-scoped Expense import contract', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const collectionPath =
      document.paths[
        `/${API_PREFIX}/users/me/spaces/{spaceId}/statement-imports`
      ];
    const itemPath =
      document.paths[
        `/${API_PREFIX}/users/me/spaces/{spaceId}/statement-imports/{statementImportId}`
      ];
    expect(collectionPath?.get?.operationId).toBe(
      'SpaceStatementImports_listStatementImports',
    );
    expect(collectionPath?.post?.operationId).toBe(
      'SpaceStatementImports_commitReviewedStatementImport',
    );
    expect(itemPath?.get?.operationId).toBe(
      'SpaceStatementImports_getStatementImport',
    );
    expect(collectionPath?.post?.responses['201']).toMatchObject({
      headers: {
        Location: {
          schema: {
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

    const schemas = document.components?.schemas ?? {};
    const commit = schema(document, 'CommitReviewedStatementImportDto');
    expect(commit.required).toEqual(
      expect.arrayContaining([
        'fileName',
        'fileHash',
        'statementType',
        'provider',
        'expenses',
      ]),
    );
    for (const property of [
      'provider',
      'accountFormat',
      'historyFromDate',
      'historyToDate',
      'expenses',
    ]) {
      expect(commit.properties).toHaveProperty(property);
    }
    expect(commit.properties).not.toHaveProperty('bank');
    expect(commit.properties).not.toHaveProperty('transactions');

    const reviewedExpense = schema(document, 'ReviewedExpenseDto');
    expect(reviewedExpense.required).toEqual([
      'categoryId',
      'expenseDate',
      'description',
      'amount',
    ]);
    expect(reviewedExpense.properties).not.toHaveProperty(
      'categoryMatchConfidence',
    );
    expect(reviewedExpense.properties).not.toHaveProperty('purchaseDate');

    const response = schema(document, 'StatementImportResponseDto');
    expect(response.required).toEqual(
      expect.arrayContaining([
        'provider',
        'accountFormat',
        'historyFromDate',
        'historyToDate',
        'importedByUserId',
      ]),
    );
    expect(response.properties).not.toHaveProperty('bank');
    expect(response.properties).not.toHaveProperty('fileHash');
    const history = schema(document, 'StatementImportHistoryResponseDto');
    expect(history.required).toContain('expenseCount');
    expect(history.properties).not.toHaveProperty('transactionCount');

    expect(
      document.paths[
        `/${API_PREFIX}/users/me/spaces/{spaceId}/statement-imports/category-suggestions`
      ],
    ).toBeUndefined();
    expect(schemas).not.toHaveProperty(
      'StatementCategorySuggestionResponseDto',
    );
  });
});

function schema(
  document: OpenAPIObject,
  name: string,
): Record<string, unknown> {
  return document.components?.schemas?.[name] as Record<string, unknown>;
}
