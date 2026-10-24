import SwaggerParser from '@apidevtools/swagger-parser';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Budget OpenAPI contract', () => {
  it('documents Category Budgets only under an authorized Space', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const path =
      document.paths[
        '/api/v1/users/me/spaces/{spaceId}/categories/{categoryId}/budget'
      ];
    expect(path?.get).toBeDefined();
    expect(path?.put).toBeDefined();
    expect(path?.delete).toBeDefined();
    expect(
      document.paths['/api/v1/users/me/categories/{categoryId}/budget'],
    ).toBeUndefined();
    expect(document.components?.schemas?.BudgetResponseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$' },
        categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
      },
    });
  });
});
