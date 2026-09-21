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
import { SpaceNotFoundError } from '../src/spaces/application/space-errors';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { SpacesController } from '../src/spaces/presentation/spaces.controller';
import { USER_STORE } from '../src/users/application/user-store';

describe('authenticated Space routes', () => {
  let application: INestApplication;
  let verifier: FakeClerkTokenVerifier;
  let spaceAccessService: {
    listActiveAccessibleSpaces: jest.Mock;
    listAccessibleSpaces: jest.Mock;
    requireReadAccess: jest.Mock;
  };

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    spaceAccessService = {
      listActiveAccessibleSpaces: jest.fn().mockResolvedValue([spaceRecord()]),
      listAccessibleSpaces: jest.fn().mockResolvedValue([
        spaceRecord(),
        spaceRecord({
          id: '11',
          kind: 'shared',
          status: 'archived',
          accessLevel: 'read',
          members: [
            { id: '42', name: 'Ada Lovelace' },
            { id: '43', name: 'Grace Hopper' },
          ],
        }),
      ]),
      requireReadAccess: jest.fn().mockResolvedValue(spaceRecord()),
    };

    const module = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        {
          provide: USER_STORE,
          useValue: {
            findByClerkUserId: jest.fn().mockResolvedValue({ id: '42' }),
          },
        },
        { provide: SpaceAccessService, useValue: spaceAccessService },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    application = module.createNestApplication();
    configureApp(application, testConfig);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
  });

  it('lists accessible identity-rich Spaces, including archived history, using the authenticated User rather than a caller-supplied User ID', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces')
      .query({ userId: '99' })
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: '10',
        kind: 'personal',
        status: 'active',
        accessLevel: 'write',
        members: [{ id: '42', name: 'Ada Lovelace' }],
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
      {
        id: '11',
        kind: 'shared',
        status: 'archived',
        accessLevel: 'read',
        members: [
          { id: '42', name: 'Ada Lovelace' },
          { id: '43', name: 'Grace Hopper' },
        ],
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
    ]);
    expect(spaceAccessService.listAccessibleSpaces).toHaveBeenCalledWith('42');
  });

  it('returns the same non-disclosing not-found response for an inaccessible Space', async () => {
    spaceAccessService.requireReadAccess.mockRejectedValueOnce(
      new SpaceNotFoundError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/spaces/11')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'SPACE_NOT_FOUND',
        message: 'Space was not found',
        details: [],
      },
    });
    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '42',
      '11',
    );
  });
});

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    if (token !== 'token-a') {
      return Promise.reject(new Error('Invalid token'));
    }

    return Promise.resolve({
      userId: 'clerk_user_a',
      sessionId: 'session_a',
      claims: { sub: 'clerk_user_a' },
    });
  }
}

function spaceRecord(
  overrides: Partial<{
    id: string;
    kind: 'personal' | 'shared';
    status: 'active' | 'archived';
    accessLevel: 'read' | 'write';
    members: { id: string; name: string }[];
  }> = {},
) {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '10',
    kind: 'personal' as const,
    status: 'active' as const,
    personalOwnerUserId: '42',
    userId: '42',
    accessLevel: 'write' as const,
    members: [{ id: '42', name: 'Ada Lovelace' }],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
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
