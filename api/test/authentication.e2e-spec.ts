import { Controller, Get, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import {
  CLERK_TOKEN_VERIFIER,
  type AuthenticatedRequest,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { USER_STORE } from '../src/users/application/user-store';

describe('Clerk authentication', () => {
  let verifier: FakeClerkTokenVerifier;

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    const module = await Test.createTestingModule({
      controllers: [
        ProtectedProbeController,
        HealthProbeController,
        DocumentationJsonProbeController,
        DocumentationProbeController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        {
          provide: USER_STORE,
          useValue: {
            findByClerkUserId: jest.fn().mockResolvedValue({ id: '42' }),
          },
        },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    testApp = module.createNestApplication();
    configureApp(testApp, testConfig);
    await testApp.init();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it.each([
    ['missing credentials', undefined],
    ['a non-Bearer scheme', 'Basic valid-session-token'],
    ['a missing Bearer token', 'Bearer'],
    ['a token containing whitespace', 'Bearer valid-session-token extra'],
    ['an invalid token', 'Bearer invalid-session-token'],
    ['an expired token', 'Bearer expired-session-token'],
    ['a not-yet-valid token', 'Bearer not-yet-valid-session-token'],
    ['a token from an unauthorized party', 'Bearer unauthorized-party-token'],
  ])('returns one opaque 401 response for %s', async (_case, authorization) => {
    const response = await getProtectedResource(authorization);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        details: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('session-token');
    expect(JSON.stringify(response.body)).not.toContain('unauthorized');
  });

  it('accepts a verified Bearer session token and exposes only normalized session context', async () => {
    const response = await getProtectedResource('Bearer valid-session-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticatedUserId: 'user_42',
      authenticatedSessionId: 'session_42',
    });
    expect(verifier.seenTokens).toContain('valid-session-token');
  });

  it('does not treat cookies or other credentials as API authentication', async () => {
    const callsBeforeRequest = verifier.seenTokens.length;
    const response = await request(testHttpServer())
      .get('/api/v1/users')
      .set('Cookie', '__session=valid-session-token')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(verifier.seenTokens).toHaveLength(callsBeforeRequest);
  });

  it('keeps health and both documentation endpoints public', async () => {
    await request(testHttpServer())
      .get('/health')
      .set('Accept', 'application/json')
      .expect(200);

    await request(testHttpServer())
      .get('/docs-json')
      .set('Accept', 'application/json')
      .expect(200);

    await request(testHttpServer())
      .get('/docs')
      .set('Accept', 'text/html')
      .expect(200);
  });

  it.each(['/health', '/docs-json', '/docs'])(
    'keeps HEAD %s public',
    async (path) => {
      await request(testHttpServer()).head(path).expect(200);
    },
  );

  it('allows the Authorization header only from configured CORS origins without cookies', async () => {
    const preflight = await request(testHttpServer())
      .options('/api/v1/users')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization');

    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://app.example.com',
    );
    expect(preflight.headers['access-control-allow-headers']).toContain(
      'Authorization',
    );
    expect(
      preflight.headers['access-control-allow-credentials'],
    ).toBeUndefined();

    const disallowedOrigin = await getProtectedResource(
      'Bearer valid-session-token',
      'https://malicious.example.com',
    );
    expect(disallowedOrigin.status).toBe(200);
    expect(
      disallowedOrigin.headers['access-control-allow-origin'],
    ).toBeUndefined();
  });
});

@Controller('users')
class ProtectedProbeController {
  @Get()
  getProtectedResource(@Req() request: AuthenticatedRequest) {
    return {
      authenticatedUserId: request.authenticatedSession?.userId,
      authenticatedSessionId: request.authenticatedSession?.sessionId,
    };
  }
}

@Controller('health')
class HealthProbeController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}

@Controller('docs-json')
class DocumentationJsonProbeController {
  @Get()
  getDocument() {
    return { public: true };
  }
}

@Controller('docs')
class DocumentationProbeController {
  @Get()
  getDocumentation() {
    return '<html><body>public</body></html>';
  }
}

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  readonly seenTokens: string[] = [];

  verify(token: string): Promise<ClerkSession> {
    this.seenTokens.push(token);

    if (token !== 'valid-session-token') {
      throw new Error(`Rejected token ${token}`);
    }

    return Promise.resolve({
      userId: 'user_42',
      sessionId: 'session_42',
      claims: { sub: 'user_42', sid: 'session_42' },
    });
  }
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  corsOrigins: ['https://app.example.com'],
  clerkJwtKey: 'test-jwt-key',
  clerkSecretKey: 'test-secret-key',
  clerkAuthorizedParties: ['https://app.example.com'],
};

function getProtectedResource(
  authorization: string | undefined,
  origin?: string,
) {
  const protectedRequest = request(testHttpServer())
    .get('/api/v1/users')
    .set('Accept', 'application/json');

  if (authorization !== undefined) {
    protectedRequest.set('Authorization', authorization);
  }
  if (origin !== undefined) {
    protectedRequest.set('Origin', origin);
  }

  return protectedRequest;
}

let testApp: INestApplication;

function testHttpServer(): Server {
  return testApp.getHttpServer() as Server;
}
