import { load } from 'js-yaml';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { Response } from 'express';
import { DocsController } from './docs.controller';
import { createOpenApiDocument } from './openapi-document.factory';
import type { OpenApiDocumentService } from './openapi-document.service';

describe('DocsController', () => {
  let document: OpenAPIObject;
  let controller: DocsController;

  beforeAll(async () => {
    document = await createOpenApiDocument();
    controller = new DocsController({
      getDocument: () => Promise.resolve(document),
    } as OpenApiDocumentService);
  });

  it('returns the document created by the shared factory', async () => {
    await expect(controller.getDocument()).resolves.toBe(document);
  });

  it('serializes that same document as YAML with the YAML media type', async () => {
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    const yamlDocument = await controller.getYamlDocument(response);

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/yaml; charset=utf-8',
    );
    expect(load(yamlDocument)).toEqual(document);
  });
});
