import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController, type OpenAPIObject } from '@nestjs/swagger';
import type { Response } from 'express';
import { dump } from 'js-yaml';
import { OpenApiDocumentService } from './openapi-document.service';

@Controller()
@ApiExcludeController()
export class DocsController {
  constructor(private readonly documentService: OpenApiDocumentService) {}

  @Get('docs-json')
  getDocument(): Promise<OpenAPIObject> {
    return this.documentService.getDocument();
  }

  @Get('docs-yaml')
  async getYamlDocument(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const document = await this.documentService.getDocument();
    response.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    return dump(document, { noRefs: true, lineWidth: -1 });
  }
}
