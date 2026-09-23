import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { DataSource, In } from 'typeorm';

import {
  CLERK_PROFILE_SERVICE,
  type ClerkProfileService,
  type ClerkUserProfile,
} from '../src/authentication/clerk-profile-service';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { configureApp } from '../src/bootstrap';
import { createAppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/app-config';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { InvitationEntity } from '../src/database/entities/invitation.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { SpaceNotificationEntity } from '../src/database/entities/space-notification.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionActivityEntity } from '../src/database/entities/transaction-activity.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';

const databaseUrl = process.env.TEST_INVITATIONS_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const INVITATION_CODE_KEY = '0123456789abcdef'.repeat(4);

describeDatabase('Invite Codes with PostgreSQL', () => {
  let application: INestApplication;
  let database: DataSource;
  let verifier: HttpTokenVerifier;
  let profileService: HttpProfileService;
  const createdInvitationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    verifier = new HttpTokenVerifier();
    profileService = new HttpProfileService();
    application = await NestFactory.create(
      createAppModule(testConfig(databaseUrl), {
        authentication: {
          tokenVerifier: {
            provide: CLERK_TOKEN_VERIFIER,
            useValue: verifier,
          },
          profileService: {
            provide: CLERK_PROFILE_SERVICE,
            useValue: profileService,
          },
        },
      }),
      { bodyParser: false },
    );
    configureApp(application, testConfig(databaseUrl));
    await application.init();
    database = application.get(DataSource);
    await database.runMigrations();
  });

  afterEach(async () => {
    if (!database?.isInitialized) return;

    if (createdInvitationIds.length > 0) {
      await database.getRepository(InvitationEntity).delete({
        id: In(createdInvitationIds),
      });
    }

    const memberships =
      createdUserIds.length > 0
        ? await database.getRepository(SpaceMembershipEntity).findBy({
            userId: In(createdUserIds),
          })
        : [];
    const spaceIds = [
      ...new Set([
        ...createdSpaceIds,
        ...memberships.map((membership) => membership.spaceId),
      ]),
    ];

    if (spaceIds.length > 0) {
      const categories = await database
        .getRepository(CategoryEntity)
        .findBy({ spaceId: In(spaceIds) });
      if (categories.length > 0) {
        await database.getRepository(BudgetEntity).delete({
          categoryId: In(categories.map((category) => category.id)),
        });
      }
      await database
        .getRepository(TransactionActivityEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(TransactionEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(CategoryRuleEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(StatementImportEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(SpaceNotificationEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(CategoryEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(SpaceMembershipEntity)
        .delete({ spaceId: In(spaceIds) });
      await database.getRepository(SpaceEntity).delete({ id: In(spaceIds) });
    }

    if (createdUserIds.length > 0) {
      await database.getRepository(UserEntity).delete({
        id: In(createdUserIds),
      });
    }

    createdInvitationIds.splice(0);
    createdUserIds.splice(0);
    createdSpaceIds.splice(0);
    verifier.clear();
    profileService.clear();
  });

  afterAll(async () => {
    if (application) await application.close();
  });

  it('creates a protected seven-day code and returns the same code later', async () => {
    const sender = createIdentity('sender');
    await provision(sender);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const createdBody = responseBody<OutgoingInvitationBody>(created);
    expect(created.status).toBe(201);
    expect(createdBody.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$/u,
    );
    createdInvitationIds.push(createdBody.id);

    const listed = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(sender));
    const listedBody = responseBody<InvitationInboxBody>(listed);
    expect(listed.status).toBe(200);
    expect(listedBody.outgoing).toEqual(createdBody);
    expect(
      Date.parse(createdBody.expiresAt) - Date.parse(createdBody.createdAt),
    ).toBe(7 * 24 * 60 * 60 * 1000);

    const persisted = await database
      .getRepository(InvitationEntity)
      .findOneBy({ id: createdBody.id });
    expect(persisted?.status).toBe('pending');
    expect(persisted?.codeHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(persisted?.codeHash).not.toBe(createdBody.code);
    expect(persisted?.codeCiphertext).not.toContain(createdBody.code);
  });

  it("does not disclose another User's outgoing code", async () => {
    const sender = createIdentity('sender');
    const other = createIdentity('other');
    await provision(sender);
    await provision(other);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const createdBody = responseBody<OutgoingInvitationBody>(created);
    expect(created.status).toBe(201);
    createdInvitationIds.push(createdBody.id);

    const listed = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(other));
    const listedBody = responseBody<InvitationInboxBody>(listed);
    expect(listed.status).toBe(200);
    expect(listedBody).toEqual({ outgoing: null, incoming: [] });
    expect(JSON.stringify(listedBody)).not.toContain(createdBody.code);
  });

  it('lets the database uniqueness boundary reject concurrent creation', async () => {
    const sender = createIdentity('racing-sender');
    await provision(sender);

    const responses = await Promise.all(
      [1, 2].map(() =>
        http()
          .post('/api/v1/users/me/invitations')
          .set(...authorization(sender))
          .send({}),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const invitations = await database
      .getRepository(InvitationEntity)
      .findBy({ status: 'pending' });
    expect(
      invitations.filter((invitation) =>
        createdUserIds.includes(invitation.senderUserId),
      ),
    ).toHaveLength(1);
    const createdResponse = responses.find(
      (response) => response.status === 201,
    );
    if (createdResponse) {
      createdInvitationIds.push(
        responseBody<OutgoingInvitationBody>(createdResponse).id,
      );
    }
  });

  it('rejects creation for a User in an active Shared Space', async () => {
    const sender = createIdentity('shared-sender');
    const senderUserId = await provision(sender);
    const sharedSpace = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    });
    createdSpaceIds.push(sharedSpace.id);
    await database.getRepository(SpaceMembershipEntity).save({
      spaceId: sharedSpace.id,
      userId: senderUserId,
      accessLevel: 'write',
    });

    const response = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const responseBodyValue = responseBody<ErrorBody>(response);

    expect(response.status).toBe(409);
    expect(responseBodyValue.error).toMatchObject({
      code: 'INVITATION_INELIGIBLE',
    });
  });

  async function provision(identity: TestIdentity): Promise<string> {
    verifier.register(identity);
    profileService.register(identity);
    const response = await http()
      .put('/api/v1/users/me')
      .set(...authorization(identity))
      .send({});
    const userBody = responseBody<{ id: string }>(response);
    expect([200, 201]).toContain(response.status);
    createdUserIds.push(userBody.id);
    return userBody.id;
  }

  function http() {
    return request(application.getHttpServer() as Server);
  }
});

interface TestIdentity {
  clerkUserId: string;
  name: string;
  email: string;
  token: string;
}

interface OutgoingInvitationBody {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface InvitationInboxBody {
  readonly outgoing: OutgoingInvitationBody | null;
  readonly incoming: readonly unknown[];
}

interface ErrorBody {
  readonly error: { readonly code: string };
}

function createIdentity(label: string): TestIdentity {
  const unique = randomUUID();
  return {
    clerkUserId: `clerk_${label}_${unique}`,
    name: `Invite ${label}`,
    email: `${label}.${unique}@example.test`,
    token: `token_${label}_${unique}`,
  };
}

function authorization(identity: TestIdentity): [string, string] {
  return ['Authorization', `Bearer ${identity.token}`];
}

class HttpTokenVerifier implements ClerkTokenVerifier {
  private readonly sessions = new Map<string, ClerkSession>();

  verify(token: string): Promise<ClerkSession> {
    const session = this.sessions.get(token);
    return session
      ? Promise.resolve(session)
      : Promise.reject(new Error('Invalid token'));
  }

  register(identity: TestIdentity): void {
    this.sessions.set(identity.token, {
      userId: identity.clerkUserId,
      sessionId: `session_${identity.clerkUserId}`,
      claims: { sub: identity.clerkUserId },
    });
  }

  clear(): void {
    this.sessions.clear();
  }
}

class HttpProfileService implements ClerkProfileService {
  private readonly profiles = new Map<string, ClerkUserProfile>();

  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile> {
    const profile = this.profiles.get(clerkUserId);
    return profile
      ? Promise.resolve(profile)
      : Promise.reject(new Error('Profile not found'));
  }

  register(identity: TestIdentity): void {
    this.profiles.set(identity.clerkUserId, {
      fullName: identity.name,
      primaryVerifiedEmail: identity.email,
    });
  }

  clear(): void {
    this.profiles.clear();
  }
}

const testConfig = (url: string | undefined): AppConfig => ({
  environment: 'test',
  port: 3000,
  databaseUrl: url,
  corsOrigins: [],
  clerkJwtKey: undefined,
  clerkSecretKey: undefined,
  clerkAuthorizedParties: [],
  invitationCodeEncryptionKey: INVITATION_CODE_KEY,
});

function responseBody<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}
