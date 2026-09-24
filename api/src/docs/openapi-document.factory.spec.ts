import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('OpenAPI document factory', () => {
  it('generates a valid, deterministic, public health tracer offline', async () => {
    const firstDocument = await createOpenApiDocument();
    const secondDocument = await createOpenApiDocument();

    expect(firstDocument).toEqual(secondDocument);
    await expect(
      SwaggerParser.validate(cloneDocument(firstDocument)),
    ).resolves.toBeDefined();
    expect(firstDocument.openapi).toBe('3.0.3');
    expect(firstDocument.info.version).toBe('1.0.0');
    expect(firstDocument.security).toEqual([{ bearerAuth: [] }]);
    expect(firstDocument.components?.securitySchemes).toMatchObject({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    });

    const healthOperation = firstDocument.paths['/health']?.get;
    expect(healthOperation).toBeDefined();
    expect(healthOperation).toMatchObject({
      operationId: 'Health_getHealth',
      tags: ['Health'],
      security: [],
    });
    expectResponse(
      healthOperation as OperationObject,
      '200',
      'Database is ready.',
    );
    expectResponse(
      healthOperation as OperationObject,
      '503',
      'Database is unavailable.',
    );

    const responseSchema = firstDocument.components?.schemas?.HealthResponseDto;
    expect(responseSchema).toMatchObject({
      type: 'object',
      required: ['status', 'database'],
      properties: {
        status: { type: 'string', enum: ['ok', 'error'] },
        database: { type: 'string', enum: ['ready', 'unavailable'] },
      },
    });
  });

  it('contains every production controller route in the offline inventory', async () => {
    const document = await createOpenApiDocument();
    const apiRoot = `/${API_PREFIX}`;
    const routes = listDocumentRoutes(document);

    expect(routes).toEqual(
      [
        'GET /health',
        `DELETE ${apiRoot}/users/me`,
        `GET ${apiRoot}/users/me`,
        `GET ${apiRoot}/users/me/notifications`,
        `PUT ${apiRoot}/users/me`,
        `POST ${apiRoot}/users/me/notifications/{notificationId}/read`,
        `POST ${apiRoot}/users/me/notifications/{notificationId}/retry`,
        `GET ${apiRoot}/users/me/categories`,
        `POST ${apiRoot}/users/me/categories`,
        `GET ${apiRoot}/users/me/categories/{categoryId}`,
        `PATCH ${apiRoot}/users/me/categories/{categoryId}`,
        `GET ${apiRoot}/users/me/categories/{categoryId}/budget`,
        `PUT ${apiRoot}/users/me/categories/{categoryId}/budget`,
        `DELETE ${apiRoot}/users/me/categories/{categoryId}/budget`,
        `GET ${apiRoot}/users/me/category-rules`,
        `POST ${apiRoot}/users/me/category-rules`,
        `DELETE ${apiRoot}/users/me/category-rules/{ruleId}`,
        `GET ${apiRoot}/users/me/category-rules/{ruleId}`,
        `PATCH ${apiRoot}/users/me/category-rules/{ruleId}`,
        `PUT ${apiRoot}/users/me/categories/{categoryId}/rules`,
        `GET ${apiRoot}/users/me/transactions`,
        `POST ${apiRoot}/users/me/transactions`,
        `DELETE ${apiRoot}/users/me/transactions/{transactionId}`,
        `GET ${apiRoot}/users/me/transactions/history`,
        `GET ${apiRoot}/users/me/transactions/{transactionId}`,
        `GET ${apiRoot}/users/me/transactions/{transactionId}/activity`,
        `PATCH ${apiRoot}/users/me/transactions/{transactionId}`,
        `GET ${apiRoot}/users/me/statement-imports`,
        `POST ${apiRoot}/users/me/statement-imports`,
        `GET ${apiRoot}/users/me/statement-imports/{statementImportId}`,
        `GET ${apiRoot}/users/me/category-summaries`,
        `GET ${apiRoot}/users/me/invitations`,
        `GET ${apiRoot}/users/me/spaces`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}`,
        `POST ${apiRoot}/users/me/spaces/{spaceId}/leave`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/categories`,
        `POST ${apiRoot}/users/me/spaces/{spaceId}/categories`,
        `POST ${apiRoot}/users/me/spaces/{spaceId}/category-rules`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}`,
        `PATCH ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}`,
        `PATCH ${apiRoot}/users/me/spaces/{spaceId}/category-rules/{ruleId}`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}/budget`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/category-rules`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/category-rules/{ruleId}`,
        `PUT ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}/budget`,
        `PUT ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}/rules`,
        `DELETE ${apiRoot}/users/me/spaces/{spaceId}/categories/{categoryId}/budget`,
        `DELETE ${apiRoot}/users/me/spaces/{spaceId}/category-rules/{ruleId}`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/category-summaries`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/statement-imports`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/statement-imports/{statementImportId}`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/transactions`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/transactions/history`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/transactions/{transactionId}`,
        `GET ${apiRoot}/users/me/spaces/{spaceId}/transactions/{transactionId}/activity`,
        `PATCH ${apiRoot}/users/me/spaces/{spaceId}/transactions/{transactionId}`,
        `POST ${apiRoot}/users/me/spaces/{spaceId}/transactions`,
        `POST ${apiRoot}/users/me/spaces/{spaceId}/statement-imports`,
        `DELETE ${apiRoot}/users/me/spaces/{spaceId}/transactions/{transactionId}`,
        `POST ${apiRoot}/users/me/invitations`,
        `DELETE ${apiRoot}/users/me/invitations`,
        `POST ${apiRoot}/users/me/invitations/rotate`,
        `POST ${apiRoot}/users/me/invitations/claims`,
        `DELETE ${apiRoot}/users/me/invitations/claims/{claimId}`,
        `POST ${apiRoot}/users/me/invitations/claims/{claimId}/accept`,
      ].sort(),
    );

    expect(document.paths['/docs']).toBeUndefined();
    expect(document.paths['/docs-json']).toBeUndefined();
    expect(routes.some((route) => route.startsWith('HEAD '))).toBe(false);
    expect(routes.some((route) => route.startsWith('OPTIONS '))).toBe(false);
  });
});

function listDocumentRoutes(document: OpenAPIObject): string[] {
  const methods = new Set([
    'delete',
    'get',
    'head',
    'options',
    'patch',
    'post',
    'put',
  ]);

  return Object.entries(document.paths)
    .flatMap(([path, pathItem]) =>
      Object.keys(pathItem)
        .filter((method) => methods.has(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

function expectResponse(
  operation: OperationObject,
  status: string,
  description: string,
): void {
  expect(operation.responses[status]).toMatchObject({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/HealthResponseDto' },
      },
    },
  });
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}
