import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { configureApp } from '../src/bootstrap';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { InvitationsService } from '../src/invitations/application/invitations.service';
import {
  InvitationCodeRateLimitedError,
  InvitationCodeUnavailableError,
} from '../src/invitations/application/invitation-errors';
import { InvitationsController } from '../src/invitations/presentation/invitations.controller';
import { USER_STORE } from '../src/users/application/user-store';

describe('authenticated Invite Code routes', () => {
  let application: INestApplication;
  let verifier: FakeClerkTokenVerifier;
  const invitationsService = {
    listForUser: jest.fn(),
    createForUser: jest.fn(),
    claimForUser: jest.fn(),
    declineForUser: jest.fn(),
  };

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    const module = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        {
          provide: USER_STORE,
          useValue: {
            findByClerkUserId: jest.fn().mockResolvedValue({ id: '42' }),
          },
        },
        { provide: InvitationsService, useValue: invitationsService },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();

    application = module.createNestApplication();
    configureApp(application, testConfig);
    await application.init();
  });

  beforeEach(() => {
    invitationsService.listForUser.mockReset().mockResolvedValue({
      outgoing: {
        id: '7',
        code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
        status: 'pending',
        expiresAt: '2026-09-30T00:00:00.000Z',
        createdAt: '2026-09-23T00:00:00.000Z',
        updatedAt: '2026-09-23T00:00:00.000Z',
      },
      incoming: [],
    });
    invitationsService.createForUser.mockReset().mockResolvedValue({
      id: '7',
      code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
      status: 'pending',
      expiresAt: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    });
    invitationsService.claimForUser.mockReset().mockResolvedValue({
      id: '88',
      senderName: 'Invite sender',
      status: 'pending',
      expiresAt: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-23T01:00:00.000Z',
    });
    invitationsService.declineForUser.mockReset().mockResolvedValue(undefined);
    verifier.reset();
  });

  afterAll(async () => {
    await application.close();
  });

  it('returns the sender-owned code from the authenticated Sharing request', async () => {
    const response = await request(application.getHttpServer() as Server)
      .get('/api/v1/users/me/invitations')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');
    const body = responseBody<InvitationInboxBody>(response);

    expect(response.status).toBe(200);
    expect(body.outgoing?.code).toBe('7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3');
    expect(invitationsService.listForUser).toHaveBeenCalledWith('42');
  });

  it('creates a code without accepting a recipient address', async () => {
    const response = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/invitations')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({});
    const body = responseBody<OutgoingInvitationBody>(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
      status: 'pending',
    });
    expect(invitationsService.createForUser).toHaveBeenCalledWith('42');
  });

  it('saves a code without creating membership and passes the network source to the service', async () => {
    const response = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/invitations/claims')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ code: '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3' });
    const body = responseBody<IncomingInvitationBody>(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      id: '88',
      senderName: 'Invite sender',
      status: 'pending',
    });
    expect(invitationsService.claimForUser).toHaveBeenCalledWith(
      '42',
      '7k3m-2q8r-5t6v-w9x2-c4d7-h8j3',
      expect.any(String),
    );
  });

  it('returns generic unavailable-code feedback for an invalid claim', async () => {
    invitationsService.claimForUser.mockRejectedValueOnce(
      new InvitationCodeUnavailableError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/invitations/claims')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ code: 'not-a-code' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'INVITATION_CODE_UNAVAILABLE',
        message:
          'Invite Code is unavailable. Ask the sender for a current code.',
        details: [],
      },
    });
  });

  it('returns a rate-limit response without looking up the submitted code', async () => {
    invitationsService.claimForUser.mockRejectedValueOnce(
      new InvitationCodeRateLimitedError(),
    );

    const response = await request(application.getHttpServer() as Server)
      .post('/api/v1/users/me/invitations/claims')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json')
      .send({ code: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3' });
    const body = responseBody<{ error: { code: string } }>(response);

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({
      code: 'INVITATION_CODE_RATE_LIMITED',
    });
  });

  it('declines only the authenticated User’s saved claim', async () => {
    const response = await request(application.getHttpServer() as Server)
      .delete('/api/v1/users/me/invitations/claims/88')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(invitationsService.declineForUser).toHaveBeenCalledWith('42', '88');
  });
});

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  private readonly verifyMock: jest.MockedFunction<
    ClerkTokenVerifier['verify']
  > = jest.fn();

  verify(token: string): Promise<ClerkSession> {
    return this.verifyMock(token);
  }

  reset(): void {
    this.verifyMock.mockReset().mockImplementation((token: string) => {
      if (token === 'token-a') {
        return Promise.resolve({
          userId: 'clerk_user_a',
          sessionId: 'session_a',
          claims: { sub: 'clerk_user_a' },
        });
      }

      return Promise.reject(new Error('Invalid token'));
    });
  }
}

interface OutgoingInvitationBody {
  readonly code: string;
  readonly status: string;
}

interface InvitationInboxBody {
  readonly outgoing: OutgoingInvitationBody | null;
}

interface IncomingInvitationBody {
  readonly id: string;
  readonly senderName: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

function responseBody<T>(response: { readonly body: unknown }): T {
  return response.body as T;
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
