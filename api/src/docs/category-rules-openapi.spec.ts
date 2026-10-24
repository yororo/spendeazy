import SwaggerParser from '@apidevtools/swagger-parser';
import { API_PREFIX } from '../config/app-config';
import { createOpenApiDocument } from './openapi-document.factory';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];

describe('Category Rule OpenAPI contract', () => {
  it('publishes only Space-scoped rule operations and replacement', async () => {
    const document = await createOpenApiDocument();
    await expect(
      SwaggerParser.validate(
        structuredClone(document) as unknown as SwaggerParserDocument,
      ),
    ).resolves.toBeDefined();

    const collectionPath = `/${API_PREFIX}/users/me/spaces/{spaceId}/category-rules`;
    const itemPath = `${collectionPath}/{ruleId}`;
    const replacementPath = `/${API_PREFIX}/users/me/spaces/{spaceId}/categories/{categoryId}/rules`;
    expect(document.paths[collectionPath]?.post?.operationId).toBe(
      'SpaceCategoryRules_createCategoryRule',
    );
    expect(document.paths[collectionPath]?.get?.operationId).toBe(
      'SpaceCategoryRules_listCategoryRules',
    );
    expect(document.paths[itemPath]?.get?.operationId).toBe(
      'SpaceCategoryRules_getCategoryRule',
    );
    expect(document.paths[itemPath]?.patch?.operationId).toBe(
      'SpaceCategoryRules_updateCategoryRule',
    );
    expect(document.paths[itemPath]?.delete?.operationId).toBe(
      'SpaceCategoryRules_deleteCategoryRule',
    );
    expect(document.paths[replacementPath]?.put?.operationId).toBe(
      'SpaceCategoryRuleReplacement_replaceCategoryRules',
    );
    expect(
      document.paths[`/${API_PREFIX}/users/me/category-rules`],
    ).toBeUndefined();

    const schemas = document.components?.schemas ?? {};
    expect(schemas.CreateCategoryRuleDto).toBeDefined();
    expect(schemas.UpdateCategoryRuleDto).toBeDefined();
    expect(schemas.SpaceReplaceCategoryRulesDto).toMatchObject({
      required: ['revision', 'rules'],
      properties: {
        revision: { type: 'string', pattern: '^\\d+$' },
      },
    });
  });
});
