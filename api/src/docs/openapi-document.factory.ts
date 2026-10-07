import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationIdFactory,
} from '@nestjs/swagger';
import { configureApiRouting } from '../http/api-routing';
import {
  DOCUMENTATION_PATH,
  JSON_DOCUMENT_PATH,
  YAML_DOCUMENT_PATH,
} from '../http/public-route-paths';
import { addApiErrorResponseComponents } from './api-error-components';
import { OpenApiModule } from './openapi.module';

export const OPENAPI_VERSION = '3.0.3';
export const API_CONTRACT_VERSION = '1.0.0';
const API_TITLE = 'Spendeazy REST API';

export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(OpenApiModule, {
    bodyParser: false,
    logger: false,
    abortOnError: false,
  });

  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  configureApiRouting(app);

  const document = SwaggerModule.createDocument(app, createDocumentConfig(), {
    autoTagControllers: false,
    operationIdFactory: stableOperationId,
  });

  addApiErrorResponseComponents(document);
  markHealthOperationPublic(document);
  return document;
}

export function setupOpenApi(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  SwaggerModule.setup(DOCUMENTATION_PATH, app, document, {
    raw: false,
    ui: true,
    jsonDocumentUrl: JSON_DOCUMENT_PATH,
    yamlDocumentUrl: YAML_DOCUMENT_PATH,
    customSiteTitle: API_TITLE,
  });
}

function createDocumentConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(
      'The Spendeazy REST API serves financial data in authorized Personal and Shared Spaces. Categories, Budgets, Category Rules, Transactions, and Statement Imports belong to a Space. Transaction Added By and Statement Import importer fields preserve actor attribution without changing Space ownership. Bigint identifiers and counts, decimal money, domain dates, and UTC timestamps use the encodings described by the schemas below.',
    )
    .setVersion(API_CONTRACT_VERSION)
    .setOpenAPIVersion(OPENAPI_VERSION)
    .addServer('/')
    .addTag('Health', 'Operational readiness.')
    .addTag('Users', 'Authenticated User identities and profile data.')
    .addTag('Spaces', 'Authorized Personal and Shared financial contexts.')
    .addTag('Categories', 'Active and historical Categories in a Space.')
    .addTag('Budgets', 'Recurring Category Budgets in a Space.')
    .addTag(
      'Category rules',
      'Exact and Contains description-matching rules used during Statement Import categorization.',
    )
    .addTag('Transactions', 'Manual and imported expenses in a Space.')
    .addTag(
      'Statement imports',
      'Reviewed import commits and history in a Space.',
    )
    .addTag(
      'Category summaries',
      'Calendar-period spending summaries for a Space.',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'bearerAuth',
    )
    .addSecurityRequirements('bearerAuth')
    .build();
}

const stableOperationId: OperationIdFactory = (
  controllerKey,
  methodKey,
  version,
) => {
  const controllerName = controllerKey.replace(/Controller$/, '');
  const operationName = controllerName
    ? `${controllerName}_${methodKey}`
    : methodKey;

  return version ? `${operationName}_${version}` : operationName;
};

function markHealthOperationPublic(document: OpenAPIObject): void {
  const healthOperation = document.paths['/health']?.get;
  if (!healthOperation) {
    throw new Error('The OpenAPI health tracer is missing GET /health');
  }

  healthOperation.security = [];
}
