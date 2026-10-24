import SwaggerParser from '@apidevtools/swagger-parser';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category OpenAPI contract', () => {
  it('documents Category CRUD only under an authorized Space', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const collection =
      document.paths['/api/v1/users/me/spaces/{spaceId}/categories'];
    const item =
      document.paths[
        '/api/v1/users/me/spaces/{spaceId}/categories/{categoryId}'
      ];
    expect(collection?.get).toBeDefined();
    expect(collection?.post).toBeDefined();
    expect(item?.get).toBeDefined();
    expect(item?.patch).toBeDefined();
    expect(document.paths['/api/v1/users/me/categories']).toBeUndefined();

    expect(document.components?.schemas?.CategoryResponseDto).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$' },
        isActive: { type: 'boolean' },
      },
    });
  });
});
