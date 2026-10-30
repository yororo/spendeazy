import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/bootstrap';
import { APP_CONFIG } from '../src/config/app-config';
import { CLERK_TOKEN_VERIFIER } from '../src/authentication/authentication';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { USER_STORE } from '../src/users/application/user-store';
import { ACCOUNT_DELETION_STORE } from '../src/users/application/account-deletion-store';
import { IDENTITY_DELETION_PROVIDER } from '../src/users/application/identity-deletion-provider';
import { ACTIVE_IDENTITY_EXECUTION } from '../src/users/application/active-identity-execution';
import { AccountDeletionService } from '../src/users/application/account-deletion.service';
import { UsersController } from '../src/users/presentation/users.controller';
import { DataSource } from 'typeorm';
import {
  DATABASE_ENTITIES,
  DATABASE_MIGRATIONS,
} from '../src/database/database-options';
import { UserEntity } from '../src/database/entities/user.entity';
import { SpaceEntity } from '../src/database/entities/space.entity';
import { CategoryEntity } from '../src/database/entities/category.entity';
import { TypeOrmAccountDeletionStore } from '../src/users/infrastructure/typeorm-account-deletion-store';
import { TypeOrmActiveIdentityExecution } from '../src/users/infrastructure/typeorm-active-identity-execution';
import { TypeOrmUserStore } from '../src/users/infrastructure/typeorm-user-store';
import { TypeOrmSpaceStore } from '../src/spaces/infrastructure/typeorm-space-store';
import { TypeOrmCategoryStore } from '../src/categories/infrastructure/typeorm-category-store';
import { DefaultCategoriesService } from '../src/categories/application/default-categories.service';
import { UsersService } from '../src/users/application/users.service';
import { AccountDeletionReconciler } from '../src/users/application/account-deletion-reconciler';
import { IdentityProviderFailure } from '../src/users/application/identity-deletion-provider';
import { TypeOrmSpaceLifecycleStore } from '../src/spaces/infrastructure/typeorm-space-lifecycle-store';

const url = process.env.TEST_SPACES_DATABASE_URL;
const describeDatabase = url ? describe : describe.skip;
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describeDatabase('durable account deletion with PostgreSQL', () => {
  let database: DataSource;
  let store: TypeOrmAccountDeletionStore;
  let execution: TypeOrmActiveIdentityExecution;
  const userIds: string[] = [];
  const spaceIds: string[] = [];
  beforeAll(async () => {
    database = await new DataSource({
      type: 'postgres',
      url,
      entities: DATABASE_ENTITIES,
      migrations: DATABASE_MIGRATIONS,
      migrationsTableName: 'typeorm_migrations',
    }).initialize();
    await database.runMigrations();
    store = new TypeOrmAccountDeletionStore(database.manager);
    execution = new TypeOrmActiveIdentityExecution(database.manager);
  });
  afterEach(async () => {
    await database.query(
      "UPDATE spaces SET status = 'active' WHERE id = ANY($1::bigint[])",
      [spaceIds],
    );
    for (const table of [
      'space_notifications',
      'space_memberships',
      'expense_activities',
      'expenses',
      'statement_import_operations',
      'statement_imports',
      'category_rules',
    ]) {
      await database.query(
        `DELETE FROM ${table} WHERE space_id = ANY($1::bigint[])`,
        [spaceIds],
      );
    }
    await database.query(
      'DELETE FROM budgets WHERE category_id IN (SELECT id FROM categories WHERE space_id = ANY($1::bigint[]))',
      [spaceIds],
    );
    await database.query(
      'DELETE FROM categories WHERE space_id = ANY($1::bigint[])',
      [spaceIds],
    );
    await database.query(
      'UPDATE users SET active_shared_space_id = NULL WHERE id = ANY($1::bigint[])',
      [userIds],
    );
    await database.query(
      'DELETE FROM invitation_claims WHERE user_id = ANY($1::bigint[]) OR invitation_id IN (SELECT id FROM invitations WHERE sender_user_id = ANY($1::bigint[]))',
      [userIds],
    );
    await database.query(
      'DELETE FROM invitations WHERE sender_user_id = ANY($1::bigint[])',
      [userIds],
    );
    await database.query('DELETE FROM spaces WHERE id = ANY($1::bigint[])', [
      spaceIds.splice(0),
    ]);
    await database.query(
      'DELETE FROM account_deletion_operations WHERE user_id = ANY($1::bigint[])',
      [userIds],
    );
    await database.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [
      userIds.splice(0),
    ]);
  });
  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  async function user() {
    const key = randomUUID();
    const result = await database.getRepository(UserEntity).save({
      clerkUserId: `clerk_${key}`,
      name: 'Fictional Person',
      email: `${key}@example.test`,
      photoUrl: 'https://example.test/photo',
    });
    userIds.push(result.id);
    return result;
  }
  async function space(owner: UserEntity, peer?: UserEntity) {
    const result = await database.getRepository(SpaceEntity).save({
      kind: peer ? 'shared' : 'personal',
      status: 'active',
      personalOwnerUserId: peer ? null : owner.id,
    });
    spaceIds.push(result.id);
    for (const member of peer ? [owner, peer] : [owner]) {
      await database.query(
        "INSERT INTO space_memberships (space_id, user_id, access_level) VALUES ($1, $2, 'write')",
        [result.id, member.id],
      );
      if (peer)
        await database.query(
          'UPDATE users SET active_shared_space_id = $1 WHERE id = $2',
          [result.id, member.id],
        );
    }
    return result;
  }
  async function financialFixture(owner: UserEntity, destination: SpaceEntity) {
    const category = await database.getRepository(CategoryEntity).save({
      spaceId: destination.id,
      name: 'Fictional Category',
      isActive: true,
    });
    const [statement] = await database.query<{ id: string }[]>(
      `INSERT INTO statement_imports
      (space_id, imported_by_user_id, file_name, file_hash, provider, statement_type)
      VALUES ($1, $2, 'fictional.pdf', $3, 'GCash', 'e_wallet') RETURNING id`,
      [destination.id, owner.id, 'a'.repeat(64)],
    );
    await database.query(
      `INSERT INTO statement_import_rows (space_id, statement_import_id, source_row_id, disposition, original_evidence, confirmed_values)
      VALUES ($1, $2, 'row-1', 'included', '{"sourceRowId":"row-1","referenceHash":null}', $3::jsonb)`,
      [
        destination.id,
        statement.id,
        JSON.stringify({
          categoryId: category.id,
          description: 'Fictional purchase',
          amount: '5.00',
          expenseDate: '2026-10-01',
        }),
      ],
    );
    const [expense] = await database.query<{ id: string }[]>(
      `INSERT INTO expenses
      (space_id, added_by_user_id, category_id, statement_import_id, expense_date, description, amount)
      VALUES ($1, $2, $3, $4, '2026-10-01', 'Fictional purchase', 5) RETURNING id`,
      [destination.id, owner.id, category.id, statement.id],
    );
    await database.query(
      `INSERT INTO expense_activities (space_id, expense_id, actor_user_id, activity_type, occurred_at, after_state)
      VALUES ($1, $2, $3, 'created', CURRENT_TIMESTAMP, '{}')`,
      [destination.id, expense.id, owner.id],
    );
    await database.query(
      `UPDATE expenses SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = $2, deleted_from_revision = revision, revision = revision + 1 WHERE id = $1`,
      [expense.id, owner.id],
    );
    await database.query(
      `INSERT INTO budgets (category_id, period, amount) VALUES ($1, 'monthly', 100)`,
      [category.id],
    );
    await database.query(
      `INSERT INTO category_rules (space_id, category_id, pattern, normalized_pattern, match_type) VALUES ($1, $2, 'fictional', 'fictional', 'contains')`,
      [destination.id, category.id],
    );
    const operationId = randomUUID();
    await database.query(
      `INSERT INTO statement_import_operations (space_id, actor_user_id, operation_id, request_hash, status, statement_import_id, success_result)
      VALUES ($1, $2, $3, $4, 'committed', $5, $6::jsonb)`,
      [
        destination.id,
        owner.id,
        operationId,
        'b'.repeat(64),
        statement.id,
        JSON.stringify({
          status: 'committed',
          operationId,
          statementImportId: statement.id,
          confirmedAt: new Date().toISOString(),
          originalExpenseCount: '1',
          originalExpenseTotal: '5.00',
        }),
      ],
    );
    await database.query(
      `INSERT INTO statement_import_operations (space_id, actor_user_id, operation_id, request_hash, status, failure)
      VALUES ($1, $2, $3, $4, 'not_committed', '{"code":"IMPORT_OPERATION_NOT_COMMITTED","details":[]}')`,
      [destination.id, owner.id, randomUUID(), 'c'.repeat(64)],
    );
  }
  async function financialSnapshot(id: string) {
    const snapshot: unknown[] = [];
    for (const table of [
      'expenses',
      'expense_activities',
      'statement_import_operations',
      'statement_imports',
      'statement_import_rows',
      'category_rules',
      'categories',
    ])
      snapshot.push(
        await database.query(
          `SELECT row_to_json(t)::text AS bytes FROM ${table} t WHERE space_id = $1 ORDER BY row_to_json(t)::text`,
          [id],
        ),
      );
    return snapshot;
  }

  it('atomically scrubs access, archives Shared history, and independently purges every Personal table', async () => {
    const owner = await user(),
      peer = await user(),
      claimant = await user();
    const personal = await space(owner),
      shared = await space(owner, peer);
    const oldArchive = await space(owner, peer);
    await financialFixture(owner, personal);
    await financialFixture(owner, shared);
    await financialFixture(owner, oldArchive);
    const spaces = new TypeOrmSpaceStore(database.manager);
    await database.getRepository(UserEntity).update(owner.id, {
      name: 'Current name',
      photoUrl: 'https://example.com/current.jpg',
    });
    expect(
      (await spaces.findAccessible(peer.id, shared.id))?.attribution,
    ).toContainEqual({
      id: owner.id,
      name: 'Current name',
      photoUrl: 'https://example.com/current.jpg',
    });
    await database.query(
      "UPDATE spaces SET status = 'archived' WHERE id = $1",
      [oldArchive.id],
    );
    await database.query(
      "UPDATE space_memberships SET access_level = 'read' WHERE space_id = $1",
      [oldArchive.id],
    );
    const before = await financialSnapshot(shared.id);
    const archivedBefore = await financialSnapshot(oldArchive.id);
    const [invitation] = await database.query<{ id: string }[]>(
      `INSERT INTO invitations (sender_user_id, code_hash, code_ciphertext, status, expires_at) VALUES ($1, $2, 'fictional', 'pending', CURRENT_TIMESTAMP + INTERVAL '1 hour') RETURNING id`,
      [owner.id, 'd'.repeat(64)],
    );
    await database.query(
      `INSERT INTO invitation_claims (invitation_id, user_id) VALUES ($1, $2)`,
      [invitation.id, claimant.id],
    );
    const accepted = await store.accept(owner.clerkUserId, 'session');
    for (const id of [shared.id, oldArchive.id]) {
      const retained = await spaces.findAccessible(peer.id, id);
      expect(retained?.members.map((member) => member.id)).toEqual([peer.id]);
      expect(retained?.attribution).toContainEqual({
        id: owner.id,
        name: 'Deleted user',
        photoUrl: null,
      });
      expect(await spaces.findAccessible(owner.id, id)).toBeNull();
    }
    expect(
      (await store.accept(owner.clerkUserId, 'session')).acceptedAt,
    ).toEqual(accepted.acceptedAt);
    expect(
      await new TypeOrmUserStore(database.manager).findByClerkUserId(
        owner.clerkUserId,
      ),
    ).toBeNull();
    expect(
      await database
        .getRepository(UserEntity)
        .findOneByOrFail({ id: owner.id }),
    ).toMatchObject({
      name: 'Deleted user',
      email: null,
      photoUrl: null,
      deletionStatus: 'pending',
      deletedAt: null,
    });
    expect(
      await database.query(
        'SELECT * FROM space_memberships WHERE user_id = $1',
        [owner.id],
      ),
    ).toEqual([]);
    expect(
      await new TypeOrmSpaceStore(database.manager).findAccessible(
        peer.id,
        oldArchive.id,
      ),
    ).not.toBeNull();
    expect(
      await database.query(
        'SELECT * FROM invitation_claims WHERE invitation_id = $1',
        [invitation.id],
      ),
    ).toEqual([]);
    expect(
      (
        await database.query<{ status: string }[]>(
          'SELECT status FROM invitations WHERE id = $1',
          [invitation.id],
        )
      )[0].status,
    ).toBe('revoked');
    expect(
      (
        await database.query<{ message: string }[]>(
          'SELECT message FROM space_notifications WHERE actor_user_id = $1',
          [owner.id],
        )
      )[0].message,
    ).not.toContain(owner.name);
    const provider = {
      verifySession: jest.fn(),
      revokeSessions: jest
        .fn()
        .mockRejectedValue(new IdentityProviderFailure('provider_unavailable')),
      deleteIdentity: jest.fn(),
    };
    await new AccountDeletionReconciler(store, provider).poll();
    const pending = (await store.find(owner.clerkUserId))!;
    expect(pending).toMatchObject({
      status: 'pending',
      lastFailureCode: 'provider_unavailable',
      providerDeletedAt: null,
    });
    expect(pending.personalDataPurgedAt).toBeInstanceOf(Date);
    for (const table of [
      'expenses',
      'expense_activities',
      'statement_import_operations',
      'statement_imports',
      'statement_import_rows',
      'category_rules',
      'categories',
      'spaces',
    ]) {
      const column = table === 'spaces' ? 'id' : 'space_id';
      expect(
        await database.query(`SELECT * FROM ${table} WHERE ${column} = $1`, [
          personal.id,
        ]),
      ).toEqual([]);
    }
    expect(await financialSnapshot(shared.id)).toEqual(before);
    expect(await financialSnapshot(oldArchive.id)).toEqual(archivedBefore);
    await database.query(
      'UPDATE account_deletion_operations SET next_attempt_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [owner.id],
    );
    provider.revokeSessions.mockResolvedValue(undefined);
    await new AccountDeletionReconciler(store, provider).poll();
    expect(await store.find(owner.clerkUserId)).toMatchObject({
      status: 'completed',
      claimToken: null,
      nextAttemptAt: null,
    });
    await expect(
      execution.execute(owner.id, 'read', () => Promise.resolve('private')),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETED' });
    const fresh = await database.getRepository(UserEntity).save({
      clerkUserId: `new_${randomUUID()}`,
      name: 'Fresh identity',
      email: owner.email,
    });
    userIds.push(fresh.id);
    expect(
      await new TypeOrmSpaceStore(database.manager).listAccessible(fresh.id),
    ).toEqual([]);
  });

  it('serves the durable HTTP protocol across worker restart and loss of status authority', async () => {
    const owner = await user();
    const personal = await space(owner);
    await financialFixture(owner, personal);
    let valid = true;
    const provider = {
      verifySession: jest.fn(() => Promise.resolve(valid)),
      revokeSessions: jest.fn(async () => {}),
      deleteIdentity: jest.fn(async () => {}),
    };
    const users = { getUserById: jest.fn(), provisionUser: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: APP_CONFIG,
          useValue: {
            environment: 'test',
            clerkJwtKey: 'fictional',
            clerkSecretKey: 'fictional',
          },
        },
        {
          provide: CLERK_TOKEN_VERIFIER,
          useValue: {
            verify: (token: string) =>
              Promise.resolve({
                userId: owner.clerkUserId,
                sessionId: token,
                claims: { sub: owner.clerkUserId },
              }),
          },
        },
        {
          provide: USER_STORE,
          useValue: new TypeOrmUserStore(database.manager),
        },
        { provide: UsersService, useValue: users },
        { provide: ACCOUNT_DELETION_STORE, useValue: store },
        { provide: IDENTITY_DELETION_PROVIDER, useValue: provider },
        { provide: ACTIVE_IDENTITY_EXECUTION, useValue: execution },
        AccountDeletionService,
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    }).compile();
    const app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const server = app.getHttpServer() as Server;
    const auth = 'Bearer initiating-session';
    try {
      await request(server)
        .get('/api/v1/users/me/deletion')
        .set('Authorization', auth)
        .expect(404);
      const accepted = await request(server)
        .delete('/api/v1/users/me')
        .set('Authorization', auth)
        .expect(202);
      expect(accepted.body).toEqual({ status: 'pending' });
      expect(accepted.headers.location).toBe('/api/v1/users/me/deletion');
      const first = await store.find(owner.clerkUserId);
      await request(server)
        .delete('/api/v1/users/me')
        .set('Authorization', auth)
        .expect(202);
      expect((await store.find(owner.clerkUserId))?.acceptedAt).toEqual(
        first?.acceptedAt,
      );
      for (const method of ['get', 'put'] as const) {
        const denied = await request(server)
          [method]('/api/v1/users/me')
          .set('Authorization', auth)
          .expect(403);
        expect(denied.body).toMatchObject({
          error: { code: 'ACCOUNT_DELETION_PENDING' },
        });
      }
      expect(users.provisionUser).not.toHaveBeenCalled();
      expect(users.getUserById).not.toHaveBeenCalled();
      const other = await request(server)
        .get('/api/v1/users/me/deletion')
        .set('Authorization', 'Bearer other-session')
        .expect(403);
      expect(other.body).toMatchObject({
        error: { code: 'ACCOUNT_DELETION_PENDING' },
      });
      const pending = await request(server)
        .get('/api/v1/users/me/deletion')
        .set('Authorization', auth)
        .expect(200);
      expect(pending.body).toEqual({ status: 'pending' });
      expect(pending.headers['cache-control']).toBe('no-store');
      // A fresh worker instance discovers durable work without any app trigger.
      await new AccountDeletionReconciler(
        new TypeOrmAccountDeletionStore(database.manager),
        provider,
      ).poll();
      const completed = await request(server)
        .get('/api/v1/users/me/deletion')
        .set('Authorization', auth)
        .expect(200);
      expect(completed.body).toEqual({ status: 'completed' });
      await request(server)
        .delete('/api/v1/users/me')
        .set('Authorization', auth)
        .expect(204);
      const fenced = await request(server)
        .put('/api/v1/users/me')
        .set('Authorization', auth)
        .expect(403);
      expect(fenced.body).toMatchObject({ error: { code: 'ACCOUNT_DELETED' } });
      valid = false;
      await request(server)
        .get('/api/v1/users/me/deletion')
        .set('Authorization', auth)
        .expect(401);
      expect((await store.find(owner.clerkUserId))?.status).toBe('completed');
    } finally {
      await app.close();
    }
  });

  it('rejects stale provisioning after a provider read resumes following acceptance', async () => {
    const owner = await user();
    await space(owner);
    const entered = barrier(),
      resume = barrier();
    const profile = {
      getUserProfile: async () => {
        entered.release();
        await resume.promise;
        return { fullName: 'Stale name', primaryVerifiedEmail: owner.email };
      },
    };
    const service = new UsersService(
      new TypeOrmUserStore(database.manager),
      profile,
      new DefaultCategoriesService(new TypeOrmCategoryStore(database.manager), {
        report: jest.fn(),
      }),
      new TypeOrmSpaceStore(database.manager),
      execution,
    );
    const request = service.provisionUser(owner.clerkUserId);
    await entered.promise;
    await store.accept(owner.clerkUserId, 'session');
    resume.release();
    await expect(request).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PENDING',
    });
    expect(
      await database.query(
        'SELECT * FROM space_memberships WHERE user_id = $1',
        [owner.id],
      ),
    ).toEqual([]);
    expect(
      await database.query(
        'SELECT * FROM categories WHERE space_id = ANY($1::bigint[])',
        [spaceIds],
      ),
    ).toEqual([]);
  });

  it('lets a preceding protected write commit fully, then rejects a delayed write and read', async () => {
    const owner = await user();
    const personal = await space(owner);
    const entered = barrier(),
      resume = barrier();
    const write = execution.execute(owner.id, 'write', async () => {
      entered.release();
      await resume.promise;
      return new TypeOrmCategoryStore(database.manager).create({
        spaceId: personal.id,
        name: 'Preceding',
        description: null,
        color: null,
      });
    });
    await entered.promise;
    const deletion = store.accept(owner.clerkUserId, 'session');
    resume.release();
    await write;
    await deletion;
    expect(
      await database
        .getRepository(CategoryEntity)
        .countBy({ spaceId: personal.id }),
    ).toBe(1);
    await expect(
      execution.execute(owner.id, 'write', async () =>
        new TypeOrmCategoryStore(database.manager).create({
          spaceId: personal.id,
          name: 'Delayed',
          description: null,
          color: null,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_PENDING' });
    await expect(
      execution.execute(owner.id, 'read', async () =>
        new TypeOrmSpaceStore(database.manager).listAccessible(owner.id),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_PENDING' });
  });

  it('serializes simultaneous member deletions and leave in numeric User lock order', async () => {
    const first = await user(),
      second = await user();
    const shared = await space(first, second);
    const lifecycle = new TypeOrmSpaceLifecycleStore(database.manager);
    const results = await Promise.allSettled([
      store.accept(first.clerkUserId, 'session-a'),
      store.accept(second.clerkUserId, 'session-b'),
      execution.execute(first.id, 'membership', () =>
        lifecycle.archiveSharedSpace(first.id, shared.id, new Date()),
      ),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(
      await database.query(
        'SELECT * FROM space_memberships WHERE space_id = $1',
        [shared.id],
      ),
    ).toEqual([]);
  });

  it('excludes simultaneous claims and rejects stale checkpoint/finish after claim expiry', async () => {
    const owner = await user();
    await space(owner);
    await store.accept(owner.clerkUserId, 'session');
    const claims = await Promise.all([store.claim(), store.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const stale = claims.find(Boolean)!;
    await database.query(
      "UPDATE account_deletion_operations SET claim_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 millisecond', accepted_at = accepted_at - INTERVAL '1 second' WHERE user_id = $1",
      [owner.id],
    );
    const fresh = (await store.claim())!;
    expect(fresh.claimToken).not.toBe(stale.claimToken);
    await store.checkpoint(stale, 'providerDeletedAt');
    await store.finishAttempt(stale, null);
    expect(await store.find(owner.clerkUserId)).toMatchObject({
      claimToken: fresh.claimToken,
      providerDeletedAt: null,
      status: 'pending',
    });
    await store.purgePersonalData(fresh);
    // Crash after purge: repeat against the same empty scope, then save checkpoints.
    await store.purgePersonalData(fresh);
    await store.checkpoint(fresh, 'personalDataPurgedAt');
    await store.checkpoint(fresh, 'providerDeletedAt');
    await store.finishAttempt(fresh, null);
    expect(await store.find(owner.clerkUserId)).toMatchObject({
      status: 'pending',
      sessionsRevokedAt: null,
    });
  });
});
