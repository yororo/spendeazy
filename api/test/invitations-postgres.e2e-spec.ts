import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';

import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { BudgetEntity } from '../src/database/entities/budget.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { CategoryRuleEntity } from '../src/database/entities/category-rule.entity';
import { InvitationDeliveryAttemptEntity } from '../src/database/entities/invitation-delivery-attempt.entity';
import { InvitationEntity } from '../src/database/entities/invitation.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { SpaceMembershipEntity } from '../src/database/entities/space-membership.entity';
import { StatementImportEntity } from '../src/database/entities/statement-import.entity';
import { TransactionEntity } from '../src/database/entities/transaction.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { DEFAULT_CATEGORY_CATALOG } from '../src/categories/application/default-category-catalog';
import { InvitationNotFoundError } from '../src/invitations/application/invitation-errors';
import { TypeOrmInvitationAcceptanceStore } from '../src/invitations/infrastructure/typeorm-invitation-acceptance-store';

const databaseUrl =
  process.env.TEST_INVITATIONS_DATABASE_URL ??
  process.env.TEST_SPACES_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('Invitation acceptance with PostgreSQL', () => {
  let database: DataSource;
  const createdInvitationIds: string[] = [];
  const createdSpaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: DATABASE_ENTITIES,
      migrations: DATABASE_MIGRATIONS,
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
    }).initialize();
    await database.runMigrations();
  });

  afterEach(async () => {
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
      await database
        .getRepository(CategoryRuleEntity)
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
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('accepts a verified secondary email and provisions one isolated Shared Space', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const secondaryEmail = `recipient-secondary-${randomUUID()}@example.test`;
    const invitation = await createInvitation(sender, secondaryEmail);
    const store = new TypeOrmInvitationAcceptanceStore(database.manager);

    const accepted = await store.accept({
      invitationId: invitation.id,
      recipientUserId: recipient.id,
      verifiedRecipientEmails: [secondaryEmail],
      now: new Date('2026-09-22T00:00:00.000Z'),
    });
    createdSpaceIds.push(accepted.id);

    expect(accepted).toMatchObject({
      id: accepted.id,
      kind: 'shared',
      status: 'active',
      userId: recipient.id,
      accessLevel: 'write',
    });
    expect(accepted.members).toHaveLength(2);
    expect(new Set(accepted.members.map((member) => member.id))).toEqual(
      new Set([sender.id, recipient.id]),
    );

    const memberships = await database
      .getRepository(SpaceMembershipEntity)
      .findBy({ spaceId: accepted.id });
    expect(memberships).toHaveLength(2);
    expect(
      new Set(memberships.map((membership) => membership.accessLevel)),
    ).toEqual(new Set(['write']));

    const categories = await database
      .getRepository(CategoryEntity)
      .findBy({ spaceId: accepted.id });
    expect(categories).toHaveLength(DEFAULT_CATEGORY_CATALOG.length);
    expect(new Set(categories.map((category) => category.name))).toEqual(
      new Set(DEFAULT_CATEGORY_CATALOG.map((category) => category.name)),
    );
    const categoryIds = categories.map((category) => category.id);

    await expect(
      database
        .getRepository(BudgetEntity)
        .findBy({ categoryId: In(categoryIds) }),
    ).resolves.toEqual([]);
    await expect(
      database
        .getRepository(CategoryRuleEntity)
        .findBy({ spaceId: accepted.id }),
    ).resolves.toEqual([]);
    await expect(
      database
        .getRepository(StatementImportEntity)
        .findBy({ spaceId: accepted.id }),
    ).resolves.toEqual([]);
    await expect(
      database
        .getRepository(TransactionEntity)
        .findBy({ spaceId: accepted.id }),
    ).resolves.toEqual([]);

    const persistedInvitation = await database
      .getRepository(InvitationEntity)
      .findOneBy({ id: invitation.id });
    expect(persistedInvitation).toMatchObject({
      status: 'accepted',
      acceptedSpaceId: accepted.id,
      recipientUserId: recipient.id,
    });

    await expect(
      store.accept({
        invitationId: invitation.id,
        recipientUserId: recipient.id,
        verifiedRecipientEmails: [secondaryEmail],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ id: accepted.id });
    await expect(
      database.getRepository(SpaceEntity).findBy({ id: accepted.id }),
    ).resolves.toHaveLength(1);
  });

  it('rejects a wrong or unverified User and self-sharing without creating a Space', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const wrongUser = await createUser('wrong-user');
    const invitation = await createInvitation(sender, recipient.email);
    const store = new TypeOrmInvitationAcceptanceStore(database.manager);

    await expect(
      store.accept({
        invitationId: invitation.id,
        recipientUserId: wrongUser.id,
        verifiedRecipientEmails: [wrongUser.email],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvitationNotFoundError);

    await expect(
      store.accept({
        invitationId: invitation.id,
        recipientUserId: recipient.id,
        verifiedRecipientEmails: ['unverified@example.test'],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvitationNotFoundError);

    const selfSender = await createUser('self-sender');
    const selfInvitation = await createInvitation(selfSender, selfSender.email);
    await expect(
      store.accept({
        invitationId: selfInvitation.id,
        recipientUserId: selfSender.id,
        verifiedRecipientEmails: [selfSender.email],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_SELF' });

    await expect(
      database.getRepository(SpaceMembershipEntity).findBy({
        userId: In([sender.id, recipient.id, wrongUser.id]),
      }),
    ).resolves.toEqual([]);
  });

  it('rolls back the Shared Space, memberships, and invitation state on provisioning failure', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const invitation = await createInvitation(sender, recipient.email);
    const store = new TypeOrmInvitationAcceptanceStore(database.manager);
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `reject_acceptance_${suffix}`;
    const triggerName = `reject_acceptance_${suffix}`;

    await database.query(`
      CREATE FUNCTION "${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'acceptance test failure';
      END;
      $$
    `);
    await database.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON categories
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      await expect(
        store.accept({
          invitationId: invitation.id,
          recipientUserId: recipient.id,
          verifiedRecipientEmails: [recipient.email],
          now: new Date('2026-09-22T00:00:00.000Z'),
        }),
      ).rejects.toBeDefined();
    } finally {
      await database.query(`DROP TRIGGER "${triggerName}" ON categories`);
      await database.query(`DROP FUNCTION "${functionName}"()`);
    }

    await expect(
      database
        .getRepository(SpaceMembershipEntity)
        .findBy({ userId: In([sender.id, recipient.id]) }),
    ).resolves.toEqual([]);
    await expect(
      database.getRepository(InvitationEntity).findOneBy({ id: invitation.id }),
    ).resolves.toMatchObject({
      status: 'pending',
      acceptedSpaceId: null,
      recipientUserId: null,
    });
  });

  it('serializes competing accepts so only one Shared Space is committed', async () => {
    const firstSender = await createUser('first-sender');
    const secondSender = await createUser('second-sender');
    const recipient = await createUser('recipient');
    const firstInvitation = await createInvitation(
      firstSender,
      recipient.email,
    );
    const secondInvitation = await createInvitation(
      secondSender,
      recipient.email,
    );
    const store = new TypeOrmInvitationAcceptanceStore(database.manager);

    const results = await Promise.allSettled([
      store.accept({
        invitationId: firstInvitation.id,
        recipientUserId: recipient.id,
        verifiedRecipientEmails: [recipient.email],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
      store.accept({
        invitationId: secondInvitation.id,
        recipientUserId: recipient.id,
        verifiedRecipientEmails: [recipient.email],
        now: new Date('2026-09-22T00:00:00.000Z'),
      }),
    ]);

    const fulfilledResults = results.filter(
      (result) => result.status === 'fulfilled',
    );
    expect(fulfilledResults).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    if (fulfilledResults[0]?.status === 'fulfilled') {
      createdSpaceIds.push(fulfilledResults[0].value.id);
      await expect(
        database
          .getRepository(SpaceEntity)
          .findBy({ id: fulfilledResults[0].value.id }),
      ).resolves.toHaveLength(1);
    }

    const persistedInvitations = await database
      .getRepository(InvitationEntity)
      .findBy({ id: In([firstInvitation.id, secondInvitation.id]) });
    expect(
      persistedInvitations.filter(
        (invitation) => invitation.status === 'accepted',
      ),
    ).toHaveLength(1);
    expect(
      persistedInvitations.filter(
        (invitation) => invitation.status === 'canceled',
      ),
    ).toHaveLength(1);
  });

  async function createUser(label: string): Promise<UserEntity> {
    const unique = randomUUID();
    const user = await database.getRepository(UserEntity).save({
      clerkUserId: `${label}_${unique}`,
      name: label,
      email: `${unique}@example.test`,
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createInvitation(
    sender: UserEntity,
    recipientEmail: string,
  ): Promise<InvitationEntity> {
    const invitation = await database.getRepository(InvitationEntity).save({
      senderUserId: sender.id,
      recipientEmail,
      recipientUserId: null,
      acceptedSpaceId: null,
      tokenHash: randomUUID().replaceAll('-', ''),
      status: 'pending',
      expiresAt: new Date('2026-09-29T00:00:00.000Z'),
      lastSentAt: null,
      deliveryStatus: 'sent',
      deliveryError: null,
    });
    createdInvitationIds.push(invitation.id);
    return invitation;
  }
});
