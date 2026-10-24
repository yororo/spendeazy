import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { USER_STORE } from '../src/users/application/user-store';
import { UsersController } from '../src/users/presentation/users.controller';
import { UsersService } from '../src/users/application/users.service';

describe('authenticated User routes', () => {
  let application: INestApplication;
  const date = new Date('2026-08-31T00:00:00.000Z');
  const user = {
    id: '42',
    clerkUserId: 'clerk_user_a',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: date,
    updatedAt: date,
  };
  const usersService = {
    provisionUser: jest.fn(),
    getUserById: jest.fn(),
    deleteByClerkUserId: jest.fn(),
  };
  const userStore = {
    findByClerkUserId: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        {
          provide: CLERK_TOKEN_VERIFIER,
          useValue: new FakeClerkTokenVerifier(),
        },
        {
          provide: USER_STORE,
          useValue: userStore,
        },
        { provide: UsersService, useValue: usersService },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    application = module.createNestApplication();
    configureApp(application);
    await application.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userStore.findByClerkUserId.mockImplementation((clerkUserId: string) =>
      Promise.resolve(clerkUserId === user.clerkUserId ? user : null),
    );
    usersService.provisionUser.mockResolvedValue({ user, created: true });
    usersService.getUserById.mockResolvedValue(user);
    usersService.deleteByClerkUserId.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await application.close();
  });

  it('provisions the authenticated Clerk identity and returns a canonical User resource', async () => {
    const response = await request(httpServer(application))
      .put('/api/v1/users/me')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/api/v1/users/me');
    expect(response.body).toEqual({
      id: '42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
    expect(usersService.provisionUser).toHaveBeenCalledWith('clerk_user_a');
  });

  it('returns the authenticated local User profile', async () => {
    const response = await request(httpServer(application))
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: '42' });
    expect(usersService.getUserById).toHaveBeenCalledWith('42');
  });

  it('rejects protected requests from an identity that has not been provisioned', async () => {
    const response = await request(httpServer(application))
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer token-b')
      .set('Accept', 'application/json');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: { code: 'USER_NOT_PROVISIONED' },
    });
    expect(usersService.getUserById).not.toHaveBeenCalled();
  });

  it('keeps the removed Personal financial aliases unavailable', async () => {
    for (const path of [
      '/api/v1/users/me/transactions',
      '/api/v1/users/me/categories',
      '/api/v1/users/me/statement-imports',
    ]) {
      const response = await request(httpServer(application))
        .get(path)
        .set('Authorization', 'Bearer token-a')
        .set('Accept', 'application/json');
      expect(response.status).toBe(404);
    }
  });

  it('advertises Bearer authentication for anonymous profile requests', async () => {
    const response = await request(httpServer(application))
      .get('/api/v1/users/me')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
});

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    if (token !== 'token-a' && token !== 'token-b') {
      return Promise.reject(new Error('Invalid token'));
    }
    const userId = token === 'token-a' ? 'clerk_user_a' : 'clerk_user_b';
    return Promise.resolve({
      userId,
      sessionId: `${userId}_session`,
      claims: { sub: userId },
    });
  }
}

function httpServer(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  clerkJwtKey: 'test-jwt-key',
  clerkSecretKey: 'test-secret-key',
  clerkAuthorizedParties: ['https://app.example.com'],
};
