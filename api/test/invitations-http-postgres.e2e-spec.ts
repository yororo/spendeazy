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
import { hashInvitationToken } from '../src/invitations/application/invitation-delivery';
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
import { InvitationDeliveryAttemptEntity } from '../src/database/entities/invitation-delivery-attempt.entity';
import { InvitationEntity } from '../src/database/entities/invitation.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionActivityEntity } from '../src/database/entities/transaction-activity.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';

const databaseUrl = process.env.TEST_INVITATIONS_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('Shared Space invitation HTTP journey with PostgreSQL', () => {
  let application: INestApplication;
  let database: DataSource;
  let verifier: HttpTokenVerifier;
  let profileService: HttpProfileService;
  const createdInvitationIds: string[] = [];
  const createdSpaceIds: string[] = [];
  const createdUserIds: string[] = [];

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
      await database
        .getRepository(InvitationDeliveryAttemptEntity)
        .delete({ invitationId: In(createdInvitationIds) });
      await database
        .getRepository(InvitationEntity)
        .delete({ id: In(createdInvitationIds) });
    }

    let spaceIds = [...createdSpaceIds];
    if (createdUserIds.length > 0) {
      const memberships = await database
        .getRepository(SpaceMembershipEntity)
        .findBy({ userId: In(createdUserIds) });
      spaceIds = [
        ...new Set([
          ...spaceIds,
          ...memberships.map((membership) => membership.spaceId),
        ]),
      ];
    }

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
        .getRepository(CategoryEntity)
        .delete({ spaceId: In(spaceIds) });
      await database
        .getRepository(SpaceMembershipEntity)
        .delete({ spaceId: In(spaceIds) });
      await database.getRepository(SpaceEntity).delete({ id: In(spaceIds) });
    }

    if (createdUserIds.length > 0) {
      await database
        .getRepository(UserEntity)
        .delete({ id: In(createdUserIds) });
    }

    createdInvitationIds.splice(0);
    createdSpaceIds.splice(0);
    createdUserIds.splice(0);
    verifier.clear();
    profileService.clear();
  });

  afterAll(async () => {
    if (application) await application.close();
  });

  it('accepts over HTTP and lets both equal members use only the resulting Shared Space', async () => {
    const sender = createIdentity('sender');
    const recipient = createIdentity('recipient');
    const thirdUser = createIdentity('third');
    const senderUserId = await provision(sender);
    const recipientUserId = await provision(recipient);
    const senderPersonalSpaceId = await personalSpaceId(sender);
    const recipientPersonalSpaceId = await personalSpaceId(recipient);

    const invitationResponse = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({ email: recipient.email });
    expect(invitationResponse.status).toBe(201);
    const invitationId = readId(responseBody(invitationResponse));
    createdInvitationIds.push(invitationId);

    const acceptanceResponse = await http()
      .post(`/api/v1/users/me/invitations/${invitationId}/accept`)
      .set(...authorization(recipient))
      .send({});
    expect(acceptanceResponse.status).toBe(200);
    const acceptanceBody = responseBody<AcceptedSpaceView>(acceptanceResponse);
    expect(acceptanceBody).toMatchObject({
      kind: 'shared',
      status: 'active',
      accessLevel: 'write',
    });
    expect(acceptanceBody.members).toHaveLength(2);
    expect(new Set(acceptanceBody.members.map((member) => member.id))).toEqual(
      new Set([senderUserId, recipientUserId]),
    );
    const sharedSpaceId = readId(acceptanceBody);
    createdSpaceIds.push(sharedSpaceId);

    const repeatedAcceptanceResponse = await http()
      .post(`/api/v1/users/me/invitations/${invitationId}/accept`)
      .set(...authorization(sender))
      .send({});
    expect(repeatedAcceptanceResponse.status).toBe(404);

    const recipientRepeat = await http()
      .post(`/api/v1/users/me/invitations/${invitationId}/accept`)
      .set(...authorization(recipient))
      .send({});
    expect(recipientRepeat.status).toBe(200);
    expect(readId(responseBody(recipientRepeat))).toBe(sharedSpaceId);

    const senderCategory = await createCategory(
      sender,
      sharedSpaceId,
      'Sender Shared Category',
    );
    const recipientCategory = await createCategory(
      recipient,
      sharedSpaceId,
      'Recipient Shared Category',
    );
    expect(await listCategories(recipient, sharedSpaceId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: senderCategory,
          name: 'Sender Shared Category',
        }),
        expect.objectContaining({
          id: recipientCategory,
          name: 'Recipient Shared Category',
        }),
      ]),
    );

    await putBudget(sender, sharedSpaceId, senderCategory);
    await putBudget(recipient, sharedSpaceId, recipientCategory);
    expect(
      (await getBudget(recipient, sharedSpaceId, senderCategory)).status,
    ).toBe(200);
    expect(
      (await getBudget(sender, sharedSpaceId, recipientCategory)).status,
    ).toBe(200);

    await createRule(sender, sharedSpaceId, senderCategory, 'SENDER SHARED');
    await createRule(
      recipient,
      sharedSpaceId,
      recipientCategory,
      'RECIPIENT SHARED',
    );
    const sharedRules = await http()
      .get(`/api/v1/users/me/spaces/${sharedSpaceId}/category-rules`)
      .set(...authorization(sender));
    expect(sharedRules.status).toBe(200);
    expect(responseBody<RulesResponse>(sharedRules).rules).toHaveLength(2);

    const senderTransaction = await createTransaction(
      sender,
      sharedSpaceId,
      senderCategory,
      'Sender shared transaction',
    );
    const senderTransactionBody =
      responseBody<TransactionResponse>(senderTransaction);
    const recipientTransaction = await createTransaction(
      recipient,
      sharedSpaceId,
      recipientCategory,
      'Recipient shared transaction',
    );
    const deleteResponse = await http()
      .delete(
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${readId(senderTransactionBody)}`,
      )
      .set(...authorization(sender))
      .set('if-match', senderTransactionBody.updatedAt);
    expect(deleteResponse.status).toBe(204);

    const retainedHistory = await http()
      .get(`/api/v1/users/me/spaces/${sharedSpaceId}/transactions/history`)
      .set(...authorization(recipient));
    expect(retainedHistory.status).toBe(200);
    expect(responseBody<ItemPageResponse>(retainedHistory).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'Sender shared transaction' }),
      ]),
    );
    const activity = await http()
      .get(
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${readId(senderTransactionBody)}/activity`,
      )
      .set(...authorization(recipient));
    expect(activity.status).toBe(200);
    expect(
      responseBody<ActivityItem[]>(activity).map((item) => item.type),
    ).toEqual(['created', 'deleted']);
    expect(recipientTransaction.status).toBe(201);

    const fileHash = `${randomUUID().replaceAll('-', '')}${'a'.repeat(32)}`;
    const importResponse = await http()
      .post(`/api/v1/users/me/spaces/${sharedSpaceId}/statement-imports`)
      .set(...authorization(recipient))
      .send({
        fileName: 'shared-journey.pdf',
        fileHash,
        statementDate: '2026-09-18',
        bank: 'Shared Journey Bank',
        cardType: 'visa',
        transactions: [
          {
            categoryId: senderCategory,
            purchaseDate: '2026-09-17',
            description: 'Shared imported transaction',
            amount: '42.00',
          },
        ],
      });
    expect(importResponse.status).toBe(201);
    const statementImportId = readId(responseBody(importResponse));

    const senderImports = await http()
      .get(`/api/v1/users/me/spaces/${sharedSpaceId}/statement-imports`)
      .set(...authorization(sender));
    expect(senderImports.status).toBe(200);
    expect(responseBody<ItemPageResponse>(senderImports).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: statementImportId,
          fileName: 'shared-journey.pdf',
          transactionCount: '1',
        }),
      ]),
    );
    const senderTransactions = await http()
      .get(`/api/v1/users/me/spaces/${sharedSpaceId}/transactions`)
      .set(...authorization(sender));
    expect(senderTransactions.status).toBe(200);
    const senderTransactionsBody =
      responseBody<TransactionPageResponse>(senderTransactions);
    expect(senderTransactionsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Recipient shared transaction',
        }),
        expect.objectContaining({ description: 'Shared imported transaction' }),
      ]),
    );
    const importedTransaction = senderTransactionsBody.items.find(
      (item) => item.description === 'Shared imported transaction',
    );
    if (!importedTransaction) {
      throw new Error('Expected the imported transaction in the shared space');
    }
    const importedActivity = await http()
      .get(
        `/api/v1/users/me/spaces/${sharedSpaceId}/transactions/${readId(importedTransaction)}/activity`,
      )
      .set(...authorization(sender));
    expect(importedActivity.status).toBe(200);
    expect(responseBody<ActivityItem[]>(importedActivity)).toEqual([
      expect.objectContaining({ type: 'created' }),
    ]);

    for (const identity of [sender, recipient]) {
      const report = await http()
        .get(
          `/api/v1/users/me/spaces/${sharedSpaceId}/category-summaries?period=monthly&year=2026&month=09`,
        )
        .set(...authorization(identity));
      expect(report.status).toBe(200);
      expect(responseBody<ReportResponse>(report).period).toBe('monthly');
    }

    const thirdUserId = await provision(thirdUser);
    const thirdSpaces = await listSpaces(thirdUser);
    expect(thirdSpaces).toHaveLength(1);
    expect(thirdSpaces[0]).toMatchObject({
      kind: 'personal',
      status: 'active',
    });
    expect(thirdUserId).not.toBe(senderUserId);

    const thirdSharedRead = await http()
      .get(`/api/v1/users/me/spaces/${sharedSpaceId}/categories`)
      .set(...authorization(thirdUser));
    expect(thirdSharedRead.status).toBe(404);

    const senderPersonalRead = await http()
      .get(`/api/v1/users/me/spaces/${senderPersonalSpaceId}/categories`)
      .set(...authorization(recipient));
    expect(senderPersonalRead.status).toBe(404);
    const recipientPersonalRead = await http()
      .get(`/api/v1/users/me/spaces/${recipientPersonalSpaceId}/categories`)
      .set(...authorization(sender));
    expect(recipientPersonalRead.status).toBe(404);
  });

  it('serializes reciprocal HTTP accepts into one Shared Space and cancels the other invitation', async () => {
    const first = createIdentity('first');
    const second = createIdentity('second');
    await provision(first);
    await provision(second);

    const firstInvitation = await createInvitation(first, second.email);
    const secondInvitation = await createInvitation(second, first.email);

    const responses = await Promise.all([
      http()
        .post(`/api/v1/users/me/invitations/${firstInvitation}/accept`)
        .set(...authorization(second))
        .send({}),
      http()
        .post(`/api/v1/users/me/invitations/${secondInvitation}/accept`)
        .set(...authorization(first))
        .send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);

    const invitations = await database
      .getRepository(InvitationEntity)
      .findBy({ id: In([firstInvitation, secondInvitation]) });
    expect(
      invitations.filter((invitation) => invitation.status === 'accepted'),
    ).toHaveLength(1);
    expect(
      invitations.filter((invitation) => invitation.status === 'canceled'),
    ).toHaveLength(1);

    const sharedSpaces = await database
      .getRepository(SpaceEntity)
      .findBy({ kind: 'shared', status: 'active' });
    expect(sharedSpaces).toHaveLength(1);
    const sharedSpace = sharedSpaces[0];
    if (!sharedSpace) throw new Error('Expected the created shared space');
    createdSpaceIds.push(sharedSpace.id);
    await expect(
      database
        .getRepository(SpaceMembershipEntity)
        .findBy({ spaceId: sharedSpace.id }),
    ).resolves.toHaveLength(2);
  });

  it('keeps registration independent and accepts a verified invited secondary email', async () => {
    const sender = createIdentity('secondary-sender');
    const recipient = createIdentity('secondary-recipient');
    await provision(sender);
    await provision(recipient);
    const invitedEmail = `invited-secondary-${randomUUID()}@example.test`;
    const invitationId = await createInvitation(sender, invitedEmail);

    const beforeVerification = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(recipient));
    expect(beforeVerification.status).toBe(200);
    expect(
      responseBody<InvitationInboxView>(beforeVerification).incoming,
    ).toEqual([]);

    profileService.addVerifiedEmail(recipient.clerkUserId, invitedEmail);

    const afterVerification = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(recipient));
    expect(afterVerification.status).toBe(200);
    expect(
      responseBody<InvitationInboxView>(afterVerification).incoming,
    ).toEqual([expect.objectContaining({ id: invitationId })]);

    const acceptance = await http()
      .post(`/api/v1/users/me/invitations/${invitationId}/accept`)
      .set(...authorization(recipient))
      .send({});
    expect(acceptance.status).toBe(200);
    const spaces = await listSpaces(recipient);
    expect(spaces.filter((space) => space.kind === 'personal')).toHaveLength(1);
    expect(spaces.filter((space) => space.kind === 'shared')).toHaveLength(1);
  });

  it('shows a stale public invitation status without changing its pending record', async () => {
    const sender = createIdentity('preview-sender');
    const senderUserId = await provision(sender);
    const token = randomUUID().replaceAll('-', '');
    const invitation = await database.getRepository(InvitationEntity).save({
      senderUserId,
      recipientEmail: 'preview-recipient@example.test',
      recipientUserId: null,
      acceptedSpaceId: null,
      tokenHash: hashInvitationToken(token),
      status: 'pending',
      expiresAt: new Date(0),
      lastSentAt: null,
      deliveryStatus: 'sent',
      deliveryError: null,
    });
    createdInvitationIds.push(invitation.id);

    const preview = await http().get(`/api/v1/invitations/${token}`);
    expect(preview.status).toBe(200);
    expect(responseBody(preview)).toMatchObject({
      id: invitation.id,
      status: 'expired',
      canDecline: false,
    });
    await expect(
      database.getRepository(InvitationEntity).findOneBy({ id: invitation.id }),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  async function provision(identity: TestIdentity): Promise<string> {
    const response = await http()
      .put('/api/v1/users/me')
      .set(...authorization(identity));
    expect([200, 201]).toContain(response.status);
    const userId = readId(response.body);
    createdUserIds.push(userId);
    return userId;
  }

  async function personalSpaceId(identity: TestIdentity): Promise<string> {
    const spaces = await listSpaces(identity);
    const personal = spaces.find((space) => space.kind === 'personal');
    if (!personal) throw new Error('Expected a Personal Space');
    return personal.id;
  }

  async function listSpaces(identity: TestIdentity): Promise<SpaceView[]> {
    const response = await http()
      .get('/api/v1/users/me/spaces')
      .set(...authorization(identity));
    expect(response.status).toBe(200);
    return response.body as SpaceView[];
  }

  async function listCategories(
    identity: TestIdentity,
    spaceId: string,
  ): Promise<CategoryView[]> {
    const response = await http()
      .get(`/api/v1/users/me/spaces/${spaceId}/categories`)
      .set(...authorization(identity));
    expect(response.status).toBe(200);
    return response.body as CategoryView[];
  }

  async function createCategory(
    identity: TestIdentity,
    spaceId: string,
    name: string,
  ): Promise<string> {
    const response = await http()
      .post(`/api/v1/users/me/spaces/${spaceId}/categories`)
      .set(...authorization(identity))
      .send({ name });
    expect(response.status).toBe(201);
    return readId(response.body);
  }

  async function putBudget(
    identity: TestIdentity,
    spaceId: string,
    categoryId: string,
  ): Promise<void> {
    const response = await http()
      .put(`/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/budget`)
      .set(...authorization(identity))
      .send({ amount: '321.00', period: 'monthly' });
    expect([200, 201]).toContain(response.status);
  }

  async function getBudget(
    identity: TestIdentity,
    spaceId: string,
    categoryId: string,
  ) {
    return http()
      .get(`/api/v1/users/me/spaces/${spaceId}/categories/${categoryId}/budget`)
      .set(...authorization(identity));
  }

  async function createRule(
    identity: TestIdentity,
    spaceId: string,
    categoryId: string,
    pattern: string,
  ): Promise<void> {
    const response = await http()
      .post(`/api/v1/users/me/spaces/${spaceId}/category-rules`)
      .set(...authorization(identity))
      .send({ categoryId, pattern, matchType: 'exact' });
    expect(response.status).toBe(201);
  }

  async function createTransaction(
    identity: TestIdentity,
    spaceId: string,
    categoryId: string,
    description: string,
  ) {
    const response = await http()
      .post(`/api/v1/users/me/spaces/${spaceId}/transactions`)
      .set(...authorization(identity))
      .send({
        categoryId,
        purchaseDate: '2026-09-16',
        description,
        amount: '18.00',
      });
    expect(response.status).toBe(201);
    return response;
  }

  async function createInvitation(
    sender: TestIdentity,
    recipientEmail: string,
  ): Promise<string> {
    const response = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({ email: recipientEmail });
    expect(response.status).toBe(201);
    const invitationId = readId(response.body);
    createdInvitationIds.push(invitationId);
    return invitationId;
  }

  function http() {
    return request(application.getHttpServer() as Server);
  }

  function createIdentity(label: string): TestIdentity {
    const suffix = randomUUID().replaceAll('-', '');
    const identity = {
      token: `${label}-${suffix}`,
      clerkUserId: `http-${label}-${suffix}`,
      email: `${label}-${suffix}@example.test`,
      name: `HTTP ${label}`,
    };
    verifier.setIdentity(identity);
    profileService.setIdentity(identity);
    return identity;
  }
});

interface TestIdentity {
  readonly token: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly name: string;
}

interface SpaceView {
  readonly id: string;
  readonly kind: 'personal' | 'shared';
  readonly status: 'active' | 'archived';
}

interface CategoryView {
  readonly id: string;
  readonly name: string;
}

interface AcceptedSpaceView extends SpaceView {
  readonly accessLevel: 'read' | 'write';
  readonly members: readonly { readonly id: string }[];
}

interface InvitationInboxView {
  readonly outgoing: unknown;
  readonly incoming: readonly unknown[];
}

interface RulesResponse {
  readonly rules: readonly unknown[];
}

interface TransactionResponse {
  readonly id: string;
  readonly updatedAt: string;
}

interface ItemPageResponse {
  readonly items: readonly unknown[];
}

interface TransactionPageResponse {
  readonly items: readonly TransactionListItem[];
}

interface TransactionListItem {
  readonly id: string;
  readonly description: string;
}

interface ActivityItem {
  readonly type: string;
}

interface ReportResponse {
  readonly period: string;
}

class HttpTokenVerifier implements ClerkTokenVerifier {
  private readonly sessions = new Map<string, ClerkSession>();

  setIdentity(identity: TestIdentity): void {
    this.sessions.set(identity.token, {
      userId: identity.clerkUserId,
      sessionId: `${identity.token}-session`,
      claims: { sub: identity.clerkUserId },
    });
  }

  verify(token: string): Promise<ClerkSession> {
    const session = this.sessions.get(token);
    return session
      ? Promise.resolve(session)
      : Promise.reject(new Error('Invalid test token'));
  }

  clear(): void {
    this.sessions.clear();
  }
}

class HttpProfileService implements ClerkProfileService {
  private readonly profiles = new Map<string, ClerkUserProfile>();

  setIdentity(identity: TestIdentity): void {
    this.profiles.set(identity.clerkUserId, {
      fullName: identity.name,
      primaryVerifiedEmail: identity.email,
      verifiedEmails: [identity.email],
    });
  }

  addVerifiedEmail(clerkUserId: string, email: string): void {
    const profile = this.profiles.get(clerkUserId);
    if (!profile) throw new Error('Missing HTTP profile');
    this.profiles.set(clerkUserId, {
      ...profile,
      verifiedEmails: [...(profile.verifiedEmails ?? []), email],
    });
  }

  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    return Promise.resolve(this.profiles.get(clerkUserId) ?? null);
  }

  clear(): void {
    this.profiles.clear();
  }
}

function authorization(identity: TestIdentity): [string, string] {
  return ['Authorization', `Bearer ${identity.token}`];
}

function responseBody<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}

function readId(value: unknown): string {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { id?: unknown }).id !== 'string'
  ) {
    throw new Error('Expected a response with a string id');
  }
  return (value as { id: string }).id;
}

function testConfig(url: string | undefined): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: url,
    corsOrigins: ['http://127.0.0.1:4173'],
    clerkJwtKey: undefined,
    clerkSecretKey: undefined,
    clerkAuthorizedParties: [],
    invitationWebBaseUrl: 'http://127.0.0.1:4173',
  };
}
