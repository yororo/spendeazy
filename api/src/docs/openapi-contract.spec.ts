import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import {
  generateOpenApiArtifacts,
  OPENAPI_ARTIFACT_DIRECTORY,
  OPENAPI_JSON_FILENAME,
  OPENAPI_YAML_FILENAME,
} from './generate-openapi';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('canonical Expense OpenAPI contract', () => {
  it('validates the document and exposes only Space-scoped financial routes', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const paths = Object.keys(document.paths);
    expect(paths).toContain('/api/v1/users/me/spaces/{spaceId}/expenses');
    expect(paths).toContain(
      '/api/v1/users/me/spaces/{spaceId}/expenses/deleted',
    );
    expect(paths).toContain(
      '/api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}/activity',
    );
    expect(paths).not.toContain('/api/v1/users/me/transactions');
    expect(paths).not.toContain('/api/v1/users/me/categories');
    expect(paths).not.toContain('/api/v1/users/me/category-rules');
    expect(paths).not.toContain('/api/v1/users/me/statement-imports');
    expect(paths).not.toContain(
      '/api/v1/users/me/spaces/{spaceId}/transactions',
    );
    expect(
      document.paths['/api/v1/users/me/spaces/{spaceId}/statement-imports']
        ?.post,
    ).toBeUndefined();
    const operation =
      document.paths[
        '/api/v1/users/me/spaces/{spaceId}/statement-import-operations/{operationId}'
      ];
    for (const status of ['200', '201', '409', '413']) {
      expect(operation?.put?.responses[status]).toBeDefined();
    }
    expect(operation?.get).toBeUndefined();
    expect(
      document.paths[
        '/api/v1/users/me/spaces/{spaceId}/statement-import-previews'
      ]?.post,
    ).toBeDefined();

    const expenses =
      document.paths['/api/v1/users/me/spaces/{spaceId}/expenses'];
    expect(expenses?.get).toBeDefined();
    expect(expenses?.post).toBeDefined();
    expect(
      document.paths['/api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}']
        ?.patch,
    ).toBeDefined();
    expect(
      document.paths['/api/v1/users/me/spaces/{spaceId}/expenses/{expenseId}']
        ?.delete,
    ).toBeDefined();

    const schemas = document.components?.schemas ?? {};
    expect(schemas.ManualExpenseResponseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
        expenseDate: { type: 'string', format: 'date' },
        revision: { type: 'string', pattern: '^[1-9]\\d*$' },
      },
    });
    expect(schemas.ExpenseHistoryPageResponseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        totalCount: { type: 'string', pattern: '^\\d+$' },
        totalAmount: { type: 'string' },
        expenses: { type: 'array' },
      },
    });
    expect(schemas).not.toHaveProperty('ManualTransactionResponseDto');
    expect(schemas).not.toHaveProperty('ReviewedStatementTransactionDto');
    expect(schemas).not.toHaveProperty('CommitReviewedStatementImportDto');
    expect(schemas.StatementImportDetailResponseDto).toBeDefined();
  });

  it('keeps committed JSON and YAML equal to deterministic generation', async () => {
    const artifacts = await generateOpenApiArtifacts();
    const json = await readFile(
      resolve(OPENAPI_ARTIFACT_DIRECTORY, OPENAPI_JSON_FILENAME),
      'utf8',
    );
    const yaml = await readFile(
      resolve(OPENAPI_ARTIFACT_DIRECTORY, OPENAPI_YAML_FILENAME),
      'utf8',
    );
    expect(artifacts.json).toBe(json);
    expect(artifacts.yaml).toBe(yaml);
    expect(JSON.parse(json)).toEqual(load(yaml));
  });
});
