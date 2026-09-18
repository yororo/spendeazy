import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import {
  DOCUMENTATION_PATH,
  JSON_DOCUMENT_PATH,
  YAML_DOCUMENT_PATH,
} from '../http/public-route-paths';
import { setupOpenApi } from './openapi-document.factory';

describe('OpenAPI setup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the interactive UI while leaving raw documents to the public controller', () => {
    const app = {} as INestApplication;
    const document = {} as OpenAPIObject;
    const setup = jest
      .spyOn(SwaggerModule, 'setup')
      .mockImplementation(() => undefined);

    setupOpenApi(app, document);

    expect(setup).toHaveBeenCalledWith(DOCUMENTATION_PATH, app, document, {
      raw: false,
      ui: true,
      jsonDocumentUrl: JSON_DOCUMENT_PATH,
      yamlDocumentUrl: YAML_DOCUMENT_PATH,
      customSiteTitle: 'Expense Tracker REST API',
    });
  });
});
