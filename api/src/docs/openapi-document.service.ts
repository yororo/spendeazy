import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document.factory';

@Injectable()
export class OpenApiDocumentService {
  private documentPromise: Promise<OpenAPIObject> | undefined;

  getDocument(): Promise<OpenAPIObject> {
    this.documentPromise ??= createOpenApiDocument();
    return this.documentPromise;
  }
}
