import SwaggerParser from '@apidevtools/swagger-parser';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category summary OpenAPI contract', () => {
  it('documents summaries only under an authorized Space', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    expect(
      document.paths['/api/v1/users/me/spaces/{spaceId}/category-summaries']
        ?.get,
    ).toBeDefined();
    expect(
      document.paths['/api/v1/users/me/category-summaries'],
    ).toBeUndefined();
    expect(
      document.components?.schemas?.CategorySummaryResponseDto,
    ).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        categories: { type: 'array' },
      },
    });
  });
});
