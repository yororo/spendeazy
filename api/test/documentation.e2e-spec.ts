import { load } from 'js-yaml';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { DocsController } from '../src/docs/docs.controller';
import {
  createOpenApiDocument,
  setupOpenApi,
} from '../src/docs/openapi-document.factory';
import { OpenApiDocumentService } from '../src/docs/openapi-document.service';
import type { AppConfig } from '../src/config/app-config';

describe('public API documentation', () => {
  let app: INestApplication;
  let document: Awaited<ReturnType<typeof createOpenApiDocument>>;

  beforeAll(async () => {
    document = await createOpenApiDocument();
    const module = await Test.createTestingModule({
      controllers: [DocsController],
      providers: [
        {
          provide: OpenApiDocumentService,
          useValue: { getDocument: () => Promise.resolve(document) },
        },
        { provide: CLERK_TOKEN_VERIFIER, useValue: fakeVerifier() },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    configureApp(app, testConfig);
    setupOpenApi(app, document);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the same contract through the UI, JSON, YAML, and assets', async () => {
    expect(
      Object.keys(document.paths).filter((path) =>
        path.includes('invitation'),
      ),
    ).toEqual([]);

    const [html, css, json, yaml] = await Promise.all([
      request(httpServer(app)).get('/docs').set('Accept', 'text/html'),
      request(httpServer(app))
        .get('/docs/swagger-ui.css')
        .set('Accept', 'text/css'),
      request(httpServer(app))
        .get('/docs-json')
        .set('Accept', 'application/json'),
      request(httpServer(app)).get('/docs-yaml').set('Accept', 'text/yaml'),
    ]);

    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toMatch(/^text\/html/);
    expect(html.text).toContain('swagger-ui-bundle.js');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/^text\/css/);
    expect(json.status).toBe(200);
    expect(json.body).toEqual(document);
    expect(yaml.status).toBe(200);
    expect(yaml.headers['content-type']).toMatch(/^text\/yaml/);
    expect(load(yaml.text)).toEqual(document);
  });

  it('negotiates JSON and YAML documentation independently', async () => {
    await request(httpServer(app))
      .get('/docs-json')
      .set('Accept', 'text/yaml')
      .expect(406);
    await request(httpServer(app))
      .get('/docs-yaml')
      .set('Accept', 'application/json')
      .expect(406);
  });
});

function fakeVerifier(): ClerkTokenVerifier {
  return { verify: () => Promise.reject(new Error('not used')) };
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  corsOrigins: [],
  clerkJwtKey: undefined,
  clerkSecretKey: undefined,
  clerkAuthorizedParties: [],
};

function httpServer(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}
