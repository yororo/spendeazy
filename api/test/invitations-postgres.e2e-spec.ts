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
import { DEFAULT_CATEGORY_CATALOG } from '../src/categories/application/default-category-catalog';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { InvitationEntity } from '../src/database/entities/invitation.entity';
import { InvitationClaimEntity } from '../src/database/entities/invitation-claim.entity';
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

  it('rotates only for the sender, removes old claims, and invalidates the old code', async () => {
    const sender = createIdentity('rotate-sender');
    const firstRecipient = createIdentity('rotate-first-recipient');
    const secondRecipient = createIdentity('rotate-second-recipient');
    await provision(sender);
    await provision(firstRecipient);
    await provision(secondRecipient);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const oldInvitation = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(oldInvitation.id);

    const firstClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(firstRecipient))
      .send({ code: oldInvitation.code });
    const firstClaimBody = responseBody<IncomingInvitationBody>(firstClaim);
    const secondClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(secondRecipient))
      .send({ code: oldInvitation.code });
    expect(secondClaim.status).toBe(201);

    const unauthorizedRotation = await http()
      .post('/api/v1/users/me/invitations/rotate')
      .set(...authorization(firstRecipient))
      .send({});
    expect(unauthorizedRotation.status).toBe(404);

    const rotated = await http()
      .post('/api/v1/users/me/invitations/rotate')
      .set(...authorization(sender))
      .send({});
    const newInvitation = responseBody<OutgoingInvitationBody>(rotated);
    createdInvitationIds.push(newInvitation.id);
    expect(rotated.status).toBe(200);
    expect(newInvitation).toMatchObject({ status: 'pending' });
    expect(newInvitation.code).not.toBe(oldInvitation.code);
    expect(
      Date.parse(newInvitation.expiresAt) - Date.parse(newInvitation.createdAt),
    ).toBe(7 * 24 * 60 * 60 * 1000);

    expect(
      await database.getRepository(InvitationClaimEntity).countBy({
        invitationId: oldInvitation.id,
      }),
    ).toBe(0);
    const recipientInbox = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(firstRecipient));
    expect(responseBody<InvitationInboxBody>(recipientInbox).incoming).toEqual(
      [],
    );

    const staleClaimJoin = await http()
      .post(`/api/v1/users/me/invitations/claims/${firstClaimBody.id}/accept`)
      .set(...authorization(firstRecipient))
      .send({});
    expect(staleClaimJoin.status).toBe(404);

    const staleCode = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(secondRecipient))
      .send({ code: oldInvitation.code });
    expect(staleCode.status).toBe(404);

    const persistedOldInvitation = await database
      .getRepository(InvitationEntity)
      .findOneBy({ id: oldInvitation.id });
    expect(persistedOldInvitation?.status).toBe('revoked');
  });

  it('revokes all claims and allows a replacement code without two pending invitations', async () => {
    const sender = createIdentity('revoke-sender');
    const recipient = createIdentity('revoke-recipient');
    const senderId = await provision(sender);
    await provision(recipient);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const oldInvitation = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(oldInvitation.id);
    const claim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(recipient))
      .send({ code: oldInvitation.code });
    expect(claim.status).toBe(201);

    const revoked = await http()
      .delete('/api/v1/users/me/invitations')
      .set(...authorization(sender));
    expect(revoked.status).toBe(204);

    const listed = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(sender));
    expect(responseBody<InvitationInboxBody>(listed).outgoing).toBeNull();
    expect(
      await database.getRepository(InvitationClaimEntity).countBy({
        invitationId: oldInvitation.id,
      }),
    ).toBe(0);
    expect(
      await database.getRepository(InvitationEntity).countBy({
        senderUserId: senderId,
        status: 'pending',
      }),
    ).toBe(0);

    const replacement = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const replacementBody = responseBody<OutgoingInvitationBody>(replacement);
    createdInvitationIds.push(replacementBody.id);
    expect(replacement.status).toBe(201);
    expect(
      await database.getRepository(InvitationEntity).countBy({
        senderUserId: senderId,
        status: 'pending',
      }),
    ).toBe(1);
  });

  it('expires pending codes and removes their claims at the expiry boundary', async () => {
    const sender = createIdentity('expiry-sender');
    const recipient = createIdentity('expiry-recipient');
    const senderId = await provision(sender);
    await provision(recipient);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const expiredInvitation = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(expiredInvitation.id);
    const claim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(recipient))
      .send({ code: expiredInvitation.code });
    expect(claim.status).toBe(201);

    await database
      .getRepository(InvitationEntity)
      .update(expiredInvitation.id, {
        expiresAt: new Date(Date.now() - 1000),
      });

    const listed = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(sender));
    expect(responseBody<InvitationInboxBody>(listed).outgoing).toBeNull();
    expect(
      await database.getRepository(InvitationClaimEntity).countBy({
        invitationId: expiredInvitation.id,
      }),
    ).toBe(0);

    const replacement = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    expect(replacement.status).toBe(201);
    createdInvitationIds.push(
      responseBody<OutgoingInvitationBody>(replacement).id,
    );
    expect(
      await database.getRepository(InvitationEntity).countBy({
        senderUserId: senderId,
        status: 'pending',
      }),
    ).toBe(1);
  });

  it('serializes rotation and joining so a stale code cannot create membership', async () => {
    const sender = createIdentity('rotate-join-sender');
    const recipient = createIdentity('rotate-join-recipient');
    await provision(sender);
    await provision(recipient);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const invitation = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(invitation.id);
    const claim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(recipient))
      .send({ code: invitation.code });
    const claimBody = responseBody<IncomingInvitationBody>(claim);

    const [rotation, join] = await Promise.all([
      http()
        .post('/api/v1/users/me/invitations/rotate')
        .set(...authorization(sender))
        .send({}),
      http()
        .post(`/api/v1/users/me/invitations/claims/${claimBody.id}/accept`)
        .set(...authorization(recipient))
        .send({}),
    ]);

    expect([rotation.status, join.status].sort()).toEqual([200, 404]);
    if (rotation.status === 200) {
      createdInvitationIds.push(
        responseBody<OutgoingInvitationBody>(rotation).id,
      );
      const staleJoin = await http()
        .post(`/api/v1/users/me/invitations/claims/${claimBody.id}/accept`)
        .set(...authorization(recipient))
        .send({});
      expect(staleJoin.status).toBe(404);
    } else {
      const joinedBody = responseBody<SharedSpaceBody>(join);
      createdSpaceIds.push(joinedBody.id);
    }
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

  it('saves multiple incoming claims, is idempotent, and lets each User decline independently', async () => {
    const sender = createIdentity('claim-sender');
    const firstRecipient = createIdentity('claim-first-recipient');
    const secondRecipient = createIdentity('claim-second-recipient');
    await provision(sender);
    await provision(firstRecipient);
    await provision(secondRecipient);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const code = responseBody<OutgoingInvitationBody>(created).code;
    createdInvitationIds.push(responseBody<OutgoingInvitationBody>(created).id);

    const firstClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(firstRecipient))
      .send({ code: code.toLowerCase().replaceAll('-', '') });
    const firstClaimBody = responseBody<IncomingInvitationBody>(firstClaim);
    expect(firstClaim.status).toBe(201);
    expect(firstClaimBody).toMatchObject({
      senderName: sender.name,
      status: 'pending',
    });

    const repeatedClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(firstRecipient))
      .send({ code });
    expect(repeatedClaim.status).toBe(201);
    expect(responseBody<IncomingInvitationBody>(repeatedClaim).id).toBe(
      firstClaimBody.id,
    );

    const secondClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(secondRecipient))
      .send({ code });
    const secondClaimBody = responseBody<IncomingInvitationBody>(secondClaim);
    expect(secondClaim.status).toBe(201);
    expect(secondClaimBody.id).not.toBe(firstClaimBody.id);

    const firstListed = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(firstRecipient));
    expect(responseBody<InvitationInboxBody>(firstListed).incoming).toEqual([
      firstClaimBody,
    ]);

    const declined = await http()
      .delete(`/api/v1/users/me/invitations/claims/${firstClaimBody.id}`)
      .set(...authorization(firstRecipient));
    expect(declined.status).toBe(204);

    const firstAfterDecline = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(firstRecipient));
    expect(
      responseBody<InvitationInboxBody>(firstAfterDecline).incoming,
    ).toEqual([]);

    const secondAfterDecline = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(secondRecipient));
    expect(
      responseBody<InvitationInboxBody>(secondAfterDecline).incoming,
    ).toEqual([secondClaimBody]);

    const reclaimed = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(firstRecipient))
      .send({ code });
    expect(reclaimed.status).toBe(201);
    expect(responseBody<IncomingInvitationBody>(reclaimed).id).not.toBe(
      firstClaimBody.id,
    );

    const persistedClaims = await database
      .getRepository(InvitationClaimEntity)
      .findBy({
        invitationId: responseBody<OutgoingInvitationBody>(created).id,
      });
    expect(persistedClaims).toHaveLength(2);
  });

  it('does not allow self-claims or claims from an active Shared Space', async () => {
    const sender = createIdentity('self-claim-sender');
    const ineligible = createIdentity('ineligible-claim-user');
    await provision(sender);
    const ineligibleUserId = await provision(ineligible);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const createdBody = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(createdBody.id);

    const selfClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(sender))
      .send({ code: createdBody.code });
    expect(selfClaim.status).toBe(404);
    expect(responseBody<ErrorBody>(selfClaim).error.code).toBe(
      'INVITATION_CODE_UNAVAILABLE',
    );

    const sharedSpace = await database.getRepository(SpaceEntity).save({
      kind: 'shared',
      status: 'active',
      personalOwnerUserId: null,
    });
    createdSpaceIds.push(sharedSpace.id);
    await database.getRepository(SpaceMembershipEntity).save({
      spaceId: sharedSpace.id,
      userId: ineligibleUserId,
      accessLevel: 'write',
    });

    const ineligibleClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(ineligible))
      .send({ code: createdBody.code });
    expect(ineligibleClaim.status).toBe(404);
    expect(responseBody<ErrorBody>(ineligibleClaim).error.code).toBe(
      'INVITATION_CODE_UNAVAILABLE',
    );
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

  it('joins from a saved claim, initializes only the new Shared Space, and consumes the code', async () => {
    const sender = createIdentity('join-sender');
    const recipient = createIdentity('join-recipient');
    const thirdUser = createIdentity('join-third-user');
    const senderId = await provision(sender);
    const recipientId = await provision(recipient);
    await provision(thirdUser);

    const created = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(sender))
      .send({});
    const createdBody = responseBody<OutgoingInvitationBody>(created);
    createdInvitationIds.push(createdBody.id);

    const recipientClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(recipient))
      .send({ code: createdBody.code });
    const recipientClaimBody =
      responseBody<IncomingInvitationBody>(recipientClaim);

    const thirdClaim = await http()
      .post('/api/v1/users/me/invitations/claims')
      .set(...authorization(thirdUser))
      .send({ code: createdBody.code });
    const thirdClaimBody = responseBody<IncomingInvitationBody>(thirdClaim);

    const joined = await http()
      .post(
        `/api/v1/users/me/invitations/claims/${recipientClaimBody.id}/accept`,
      )
      .set(...authorization(recipient))
      .send({});
    const joinedBody = responseBody<SharedSpaceBody>(joined);
    expect(joined.status).toBe(200);
    expect(joinedBody).toMatchObject({
      kind: 'shared',
      status: 'active',
      accessLevel: 'write',
      members: [
        { id: senderId, name: sender.name },
        { id: recipientId, name: recipient.name },
      ],
    });
    createdSpaceIds.push(joinedBody.id);

    const repeated = await http()
      .post(
        `/api/v1/users/me/invitations/claims/${recipientClaimBody.id}/accept`,
      )
      .set(...authorization(recipient))
      .send({});
    expect(repeated.status).toBe(200);
    expect(responseBody<SharedSpaceBody>(repeated).id).toBe(joinedBody.id);

    const invitation = await database
      .getRepository(InvitationEntity)
      .findOneBy({ id: createdBody.id });
    expect(invitation).toMatchObject({
      status: 'accepted',
      acceptedSpaceId: joinedBody.id,
    });

    const memberships = await database
      .getRepository(SpaceMembershipEntity)
      .find({ where: { spaceId: joinedBody.id }, order: { userId: 'ASC' } });
    expect(memberships).toEqual([
      expect.objectContaining({
        userId: senderId,
        accessLevel: 'write',
      }),
      expect.objectContaining({
        userId: recipientId,
        accessLevel: 'write',
      }),
    ]);
    expect(
      await database.getRepository(CategoryEntity).countBy({
        spaceId: joinedBody.id,
      }),
    ).toBe(DEFAULT_CATEGORY_CATALOG.length);
    expect(
      await database.getRepository(BudgetEntity).countBy({
        categoryId: In(
          (
            await database.getRepository(CategoryEntity).findBy({
              spaceId: joinedBody.id,
            })
          ).map((category) => category.id),
        ),
      }),
    ).toBe(0);
    expect(
      await database.getRepository(TransactionEntity).countBy({
        spaceId: joinedBody.id,
      }),
    ).toBe(0);
    expect(
      await database.getRepository(CategoryRuleEntity).countBy({
        spaceId: joinedBody.id,
      }),
    ).toBe(0);

    const thirdJoin = await http()
      .post(`/api/v1/users/me/invitations/claims/${thirdClaimBody.id}/accept`)
      .set(...authorization(thirdUser))
      .send({});
    expect(thirdJoin.status).toBe(404);

    const recipientInbox = await http()
      .get('/api/v1/users/me/invitations')
      .set(...authorization(recipient));
    expect(responseBody<InvitationInboxBody>(recipientInbox).incoming).toEqual(
      [],
    );
  });

  it('serializes competing joins so only one Shared Space is committed', async () => {
    const firstSender = createIdentity('competing-first-sender');
    const secondSender = createIdentity('competing-second-sender');
    const recipient = createIdentity('competing-recipient');
    await provision(firstSender);
    await provision(secondSender);
    await provision(recipient);

    const firstInvitation = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(firstSender))
      .send({});
    const firstInvitationBody =
      responseBody<OutgoingInvitationBody>(firstInvitation);
    createdInvitationIds.push(firstInvitationBody.id);
    const secondInvitation = await http()
      .post('/api/v1/users/me/invitations')
      .set(...authorization(secondSender))
      .send({});
    const secondInvitationBody =
      responseBody<OutgoingInvitationBody>(secondInvitation);
    createdInvitationIds.push(secondInvitationBody.id);

    const [firstClaim, secondClaim] = await Promise.all([
      http()
        .post('/api/v1/users/me/invitations/claims')
        .set(...authorization(recipient))
        .send({ code: firstInvitationBody.code }),
      http()
        .post('/api/v1/users/me/invitations/claims')
        .set(...authorization(recipient))
        .send({ code: secondInvitationBody.code }),
    ]);
    const firstClaimBody = responseBody<IncomingInvitationBody>(firstClaim);
    const secondClaimBody = responseBody<IncomingInvitationBody>(secondClaim);

    const results = await Promise.all([
      http()
        .post(`/api/v1/users/me/invitations/claims/${firstClaimBody.id}/accept`)
        .set(...authorization(recipient))
        .send({}),
      http()
        .post(
          `/api/v1/users/me/invitations/claims/${secondClaimBody.id}/accept`,
        )
        .set(...authorization(recipient))
        .send({}),
    ]);

    expect(results.filter((response) => response.status === 200)).toHaveLength(
      1,
    );
    expect(results.filter((response) => response.status !== 200)).toHaveLength(
      1,
    );

    const sharedSpaces = await database.getRepository(SpaceEntity).findBy({
      kind: 'shared',
      status: 'active',
    });
    expect(sharedSpaces).toHaveLength(1);
    createdSpaceIds.push(sharedSpaces[0].id);

    const persistedInvitations = await database
      .getRepository(InvitationEntity)
      .findBy({ id: In([firstInvitationBody.id, secondInvitationBody.id]) });
    expect(
      persistedInvitations.filter(
        (invitation) => invitation.status === 'accepted',
      ),
    ).toHaveLength(1);
    expect(
      persistedInvitations.filter(
        (invitation) => invitation.status === 'revoked',
      ),
    ).toHaveLength(1);
    expect(
      await database.getRepository(InvitationClaimEntity).countBy({
        invitationId: persistedInvitations.find(
          (invitation) => invitation.status === 'revoked',
        )!.id,
      }),
    ).toBe(0);
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
  readonly incoming: readonly IncomingInvitationBody[];
}

interface IncomingInvitationBody {
  readonly id: string;
  readonly senderName: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

interface SharedSpaceBody {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly accessLevel: string;
  readonly members: readonly { readonly id: string; readonly name: string }[];
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
