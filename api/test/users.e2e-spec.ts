import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
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
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { CategoriesController } from '../src/categories/presentation/categories.controller';
import { CategoriesService } from '../src/categories/application/categories.service';
import {
  DEFAULT_CATEGORIES_LOGGER,
  DEFAULT_CATEGORY_PROVISIONER,
  DefaultCategoriesService,
} from '../src/categories/application/default-categories.service';
import { DEFAULT_CATEGORY_CATALOG } from '../src/categories/application/default-category-catalog';
import { resolveCategoryColor } from '../src/categories/application/category-color';
import {
  CATEGORY_STORE,
  type CategoryRecord,
  type CategoryStore,
  type NewCategory,
} from '../src/categories/application/category-store';
import { CategoryNotFoundError } from '../src/categories/application/category-errors';
import { CategorySummariesController } from '../src/categories/presentation/category-summaries.controller';
import { CategorySummariesService } from '../src/categories/application/category-summaries.service';
import { BudgetsController } from '../src/categories/presentation/budgets.controller';
import { BudgetsService } from '../src/categories/application/budgets.service';
import { CategoryRulesController } from '../src/category-rules/presentation/category-rules.controller';
import { CategoryRulesService } from '../src/category-rules/application/category-rules.service';
import { CategoryRuleNotFoundError } from '../src/category-rules/application/category-rule-errors';
import type { CategoryRuleRecord } from '../src/category-rules/application/category-rule-store';
import { TransactionsController } from '../src/transactions/presentation/transactions.controller';
import { TransactionsService } from '../src/transactions/application/transactions.service';
import { TransactionNotFoundError } from '../src/transactions/application/transaction-errors';
import type { ImportedTransactionRecord } from '../src/transactions/application/imported-transaction-store';
import type {
  ManualTransactionRecord,
  TransactionRecord,
} from '../src/transactions/application/transaction-store';
import { StatementImportsController } from '../src/statement-imports/presentation/statement-imports.controller';
import { StatementImportsService } from '../src/statement-imports/application/statement-imports.service';
import { UsersController } from '../src/users/presentation/users.controller';
import { UsersService } from '../src/users/application/users.service';
import { PERSONAL_SPACE_PROVISIONER } from '../src/spaces/application/space-store';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import {
  USER_STORE,
  type NewUser,
  type UpdateUser,
  type UserRecord,
  type UserStore,
} from '../src/users/application/user-store';

let application: INestApplication;

function invoke(mock: jest.Mock, ...args: unknown[]): Promise<unknown> {
  return Promise.resolve(mock(...args) as unknown);
}

describe('authenticated User routes', () => {
  let verifier: FakeClerkTokenVerifier;
  let profileService: FakeClerkProfileService;
  let userStore: InMemoryUserStore;
  let defaultCategoryStore: InMemoryDefaultCategoryStore;
  let categoriesService: {
    createCategory: jest.Mock;
    listCategories: jest.Mock;
    getCategory: jest.Mock;
    updateCategory: jest.Mock;
  };
  let budgetsService: {
    putBudget: jest.Mock;
    getBudget: jest.Mock;
    deleteBudget: jest.Mock;
  };
  let categorySummariesService: {
    getCategorySummary: jest.Mock;
  };
  let categoryRulesService: {
    createCategoryRule: jest.Mock;
    listCategoryRules: jest.Mock;
    getCategoryRule: jest.Mock;
    updateCategoryRule: jest.Mock;
    deleteCategoryRule: jest.Mock;
  };
  let transactionsService: {
    createManualTransaction: jest.Mock;
    listTransactions: jest.Mock;
    getManualTransaction: jest.Mock;
    updateTransaction: jest.Mock;
    deleteManualTransaction: jest.Mock;
  };
  let alternateUserId: string | undefined;

  beforeAll(async () => {
    verifier = new FakeClerkTokenVerifier();
    profileService = new FakeClerkProfileService({
      fullName: 'Ada Lovelace',
      primaryVerifiedEmail: 'ada@example.com',
    });
    userStore = new InMemoryUserStore();
    defaultCategoryStore = new InMemoryDefaultCategoryStore();
    categoriesService = {
      createCategory: jest.fn().mockResolvedValue(categoryRecord()),
      listCategories: jest
        .fn()
        .mockImplementation((userId: string) =>
          defaultCategoryStore.findAll(userId),
        ),
      getCategory: jest.fn().mockResolvedValue(categoryRecord({ id: '100' })),
      updateCategory: jest
        .fn()
        .mockResolvedValue(categoryRecord({ id: '100' })),
    };
    budgetsService = {
      putBudget: jest
        .fn()
        .mockResolvedValue({ budget: budgetRecord('100'), created: true }),
      getBudget: jest.fn().mockResolvedValue(budgetRecord('100')),
      deleteBudget: jest.fn().mockResolvedValue(undefined),
    };
    categorySummariesService = {
      getCategorySummary: jest.fn().mockResolvedValue(categorySummaryRecord()),
    };
    categoryRulesService = {
      createCategoryRule: jest
        .fn()
        .mockResolvedValue(categoryRuleRecord({ id: '200' })),
      listCategoryRules: jest
        .fn()
        .mockResolvedValue([categoryRuleRecord({ id: '200' })]),
      getCategoryRule: jest
        .fn()
        .mockResolvedValue(categoryRuleRecord({ id: '200' })),
      updateCategoryRule: jest
        .fn()
        .mockResolvedValue(categoryRuleRecord({ id: '200' })),
      deleteCategoryRule: jest.fn().mockResolvedValue(undefined),
    };
    transactionsService = {
      createManualTransaction: jest
        .fn()
        .mockResolvedValue(transactionRecord({ id: '300', userId: '99' })),
      listTransactions: jest.fn().mockResolvedValue({
        items: [transactionPageRecord({ id: '300', userId: '99' })],
        nextCursor: null,
      }),
      getManualTransaction: jest
        .fn()
        .mockResolvedValue(transactionRecord({ id: '300', userId: '99' })),
      updateTransaction: jest
        .fn()
        .mockResolvedValue(
          importedTransactionRecord({ id: '301', userId: '99' }),
        ),
      deleteManualTransaction: jest.fn().mockResolvedValue(undefined),
    };
    Object.assign(categoriesService, {
      createCategoryInSpace: (
        userId: string,
        _spaceId: string,
        input: unknown,
      ) => invoke(categoriesService.createCategory, userId, input),
      listCategoriesInSpace: (spaceId: string) =>
        invoke(categoriesService.listCategories, spaceId),
      getCategoryInSpace: (spaceId: string, id: string) =>
        invoke(categoriesService.getCategory, spaceId, id),
      updateCategoryInSpace: (spaceId: string, id: string, input: unknown) =>
        invoke(categoriesService.updateCategory, spaceId, id, input),
    });
    Object.assign(budgetsService, {
      putBudgetInSpace: (spaceId: string, id: string, input: unknown) =>
        invoke(budgetsService.putBudget, spaceId, id, input),
      getBudgetInSpace: (spaceId: string, id: string) =>
        invoke(budgetsService.getBudget, spaceId, id),
      deleteBudgetInSpace: (spaceId: string, id: string) =>
        invoke(budgetsService.deleteBudget, spaceId, id),
    });
    Object.assign(categorySummariesService, {
      getCategorySummaryInSpace: (spaceId: string, query: unknown) =>
        invoke(categorySummariesService.getCategorySummary, spaceId, query),
    });
    Object.assign(categoryRulesService, {
      createCategoryRuleInSpace: (
        userId: string,
        _spaceId: string,
        input: unknown,
      ) => invoke(categoryRulesService.createCategoryRule, userId, input),
      listCategoryRulesInSpace: async (spaceId: string) => ({
        rules: await invoke(categoryRulesService.listCategoryRules, spaceId),
        revision: '0',
      }),
      getCategoryRuleInSpace: (spaceId: string, id: string) =>
        invoke(categoryRulesService.getCategoryRule, spaceId, id),
      updateCategoryRuleInSpace: (
        spaceId: string,
        id: string,
        input: unknown,
      ) => invoke(categoryRulesService.updateCategoryRule, spaceId, id, input),
      deleteCategoryRuleInSpace: (spaceId: string, id: string) =>
        invoke(categoryRulesService.deleteCategoryRule, spaceId, id),
    });
    Object.assign(transactionsService, {
      createManualTransactionInSpace: (
        userId: string,
        _spaceId: string,
        input: unknown,
      ) => invoke(transactionsService.createManualTransaction, userId, input),
      listTransactionsInSpace: (spaceId: string, query: unknown) =>
        invoke(transactionsService.listTransactions, spaceId, query),
      getManualTransactionInSpace: (spaceId: string, id: string) =>
        invoke(transactionsService.getManualTransaction, spaceId, id),
      updateTransactionInSpace: (spaceId: string, id: string, input: unknown) =>
        invoke(transactionsService.updateTransaction, spaceId, id, input),
      deleteManualTransactionInSpace: (spaceId: string, id: string) =>
        invoke(transactionsService.deleteManualTransaction, spaceId, id),
    });
    const module = await Test.createTestingModule({
      controllers: [
        UsersController,
        CategoriesController,
        CategorySummariesController,
        BudgetsController,
        CategoryRulesController,
        TransactionsController,
        StatementImportsController,
        HealthProbeController,
        DocumentationJsonProbeController,
        DocumentationProbeController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: testConfig },
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        { provide: CLERK_PROFILE_SERVICE, useValue: profileService },
        { provide: USER_STORE, useValue: userStore },
        ClerkAuthenticationGuard,
        { provide: CategoriesService, useValue: categoriesService },
        { provide: CATEGORY_STORE, useValue: defaultCategoryStore },
        { provide: DEFAULT_CATEGORIES_LOGGER, useValue: { report: jest.fn() } },
        DefaultCategoriesService,
        {
          provide: DEFAULT_CATEGORY_PROVISIONER,
          useExisting: DefaultCategoriesService,
        },
        {
          provide: PERSONAL_SPACE_PROVISIONER,
          useValue: {
            ensurePersonalSpace: jest
              .fn()
              .mockImplementation((userId: string) => Promise.resolve(userId)),
          },
        },
        {
          provide: CategorySummariesService,
          useValue: categorySummariesService,
        },
        { provide: BudgetsService, useValue: budgetsService },
        { provide: CategoryRulesService, useValue: categoryRulesService },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: StatementImportsService, useValue: {} },
        {
          provide: SpaceAccessService,
          useValue: {
            requirePersonalSpace: (userId: string) =>
              Promise.resolve({ id: userId }),
            requirePersonalWriteSpace: (userId: string) =>
              Promise.resolve({ id: userId }),
          },
        },
        UsersService,
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

  function ensureAlternateUser(): string {
    if (alternateUserId !== undefined) {
      return alternateUserId;
    }

    const user = userStore.createWithId('99', {
      clerkUserId: 'user_c',
      name: 'Grace Hopper',
      email: 'grace@example.com',
    });
    alternateUserId = user.id;
    return alternateUserId;
  }

  it('allows a verified identity to provision itself from the Clerk profile', async () => {
    const response = await putMyUser({
      name: 'Caller-controlled name',
      email: 'caller@example.com',
    });

    expect(response.status).toBe(201);
    const provisioned = response;
    expect(provisioned.headers.location).toBe('/api/v1/users/me');
    expect(userResponseBody(provisioned)).toMatchObject({
      id: '42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(profileService.requestedClerkUserIds).toContain('user_a');
    await expect(userStore.findByClerkUserId('user_a')).resolves.toMatchObject({
      clerkUserId: 'user_a',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    const defaults = DEFAULT_CATEGORY_CATALOG.map((category, index) =>
      categoryRecord({
        id: String(index + 1),
        userId: '42',
        spaceId: '42',
        ...category,
      }),
    );
    const categories = await request(testHttpServer())
      .get('/api/v1/users/me/categories')
      .set('Authorization', 'Bearer token-a')
      .set('Accept', 'application/json');

    expect(categories.status).toBe(200);
    expect(categories.body).toEqual(
      defaults.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        color: resolveCategoryColor(category.id, category.color),
        isActive: category.isActive,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      })),
    );
    expect(await defaultCategoryStore.findAll('42')).toEqual(defaults);
    expect(await defaultCategoryStore.findAll('999')).toEqual([]);
    expect(budgetsService.putBudget).not.toHaveBeenCalled();
  });

  it('allows bodyless User provisioning without Content-Type', async () => {
    const response = await request(testHttpServer())
      .put('/api/v1/users/me')
      .set('Authorization', 'Bearer token-d')
      .set('Accept', 'application/json');

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/api/v1/users/me');
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('returns the local User and makes retries idempotent while synchronizing Clerk profile changes', async () => {
    const first = await putMyUser({});
    expect(first.status).toBe(200);

    const current = await getMyUser();
    expect(current.status).toBe(200);
    expect(userResponseBody(current)).toMatchObject({
      id: '42',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    profileService.profile = {
      fullName: 'Ada Byron Lovelace',
      primaryVerifiedEmail: 'ADA@new.example.com',
    };
    const synchronized = await putMyUser({});

    expect(synchronized.status).toBe(200);
    expect(synchronized.body).toMatchObject({
      id: '42',
      name: 'Ada Byron Lovelace',
      email: 'ada@new.example.com',
    });
  });

  it('returns 403 for an authenticated identity before provisioning other protected operations', async () => {
    const response = await request(testHttpServer())
      .get('/api/v1/users/me/categories')
      .set('Authorization', 'Bearer token-b')
      .set('Accept', 'application/json');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'USER_NOT_PROVISIONED',
        message: 'User is not provisioned',
        details: [],
      },
    });
  });

  it('returns 403 when an authenticated identity fetches its unprovisioned User', async () => {
    const response = await request(testHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer token-b')
      .set('Accept', 'application/json');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'USER_NOT_PROVISIONED',
        message: 'User is not provisioned',
        details: [],
      },
    });
  });

  it('keeps an existing email conflict from linking a different Clerk subject', async () => {
    await userStore.create({
      clerkUserId: 'existing_clerk_user',
      name: 'Existing User',
      email: 'taken@example.com',
    });
    profileService.profile = {
      fullName: 'Another User',
      primaryVerifiedEmail: 'TAKEN@example.com',
    };

    const response = await putMyUser({}, 'token-b');

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('EMAIL_ALREADY_EXISTS');
    await expect(userStore.findByClerkUserId('user_b')).resolves.toBeNull();
  });

  it('passes only the authenticated local User ID to self-scoped feature services', async () => {
    const userId = ensureAlternateUser();
    const selected = categoryRecord({ color: 'teal' });
    categoriesService.createCategory.mockResolvedValue(selected);
    const response = await request(testHttpServer())
      .post('/api/v1/users/me/categories')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        name: 'Groceries',
        description: '  Food staples  ',
        color: 'teal',
      });

    expect(response.status).toBe(201);
    expect(categoriesService.createCategory).toHaveBeenCalledWith(userId, {
      name: 'Groceries',
      description: 'Food staples',
      color: 'teal',
    });
    expect(response.body).toMatchObject({ description: null });
    expect(categoryBody(response).color).toBe('teal');
    expect(response.headers.location).toBe('/api/v1/users/me/categories/42');
  });

  it('supports named colors on create, color-only update, and subsequent reads', async () => {
    const userId = ensureAlternateUser();
    const selected = categoryRecord({ id: '101', color: 'teal' });
    const updated = categoryRecord({ id: '101', color: 'forest' });
    categoriesService.createCategory.mockResolvedValue(selected);
    categoriesService.updateCategory.mockResolvedValue(updated);
    categoriesService.getCategory.mockResolvedValue(updated);
    const headers = {
      Authorization: 'Bearer token-c',
      Accept: 'application/json',
    };

    const created = await request(testHttpServer())
      .post('/api/v1/users/me/categories')
      .set(headers)
      .send({ name: 'Dining', color: 'teal' });
    const edited = await request(testHttpServer())
      .patch('/api/v1/users/me/categories/101')
      .set(headers)
      .send({ color: 'forest' });
    const reloaded = await request(testHttpServer())
      .get('/api/v1/users/me/categories/101')
      .set(headers);

    expect(created.status).toBe(201);
    expect(categoryBody(created).color).toBe('teal');
    expect(edited.status).toBe(200);
    expect(categoryBody(edited).color).toBe('forest');
    expect(reloaded.status).toBe(200);
    expect(categoryBody(reloaded).color).toBe('forest');
    expect(categoriesService.createCategory).toHaveBeenCalledWith(userId, {
      name: 'Dining',
      color: 'teal',
    });
    expect(categoriesService.updateCategory).toHaveBeenCalledWith(
      userId,
      '101',
      { color: 'forest' },
    );
  });

  it('rejects invalid Category descriptions through the validation contract', async () => {
    const headers = {
      Authorization: 'Bearer token-c',
      Accept: 'application/json',
    };
    const wrongType = await request(testHttpServer())
      .post('/api/v1/users/me/categories')
      .set(headers)
      .send({ name: 'Dining', description: 42 });
    const overlong = await request(testHttpServer())
      .patch('/api/v1/users/me/categories/42')
      .set(headers)
      .send({ description: 'x'.repeat(501) });
    const unsupportedColor = await request(testHttpServer())
      .post('/api/v1/users/me/categories')
      .set(headers)
      .send({ name: 'Dining', color: '#ffffff' });
    const unknownColor = await request(testHttpServer())
      .patch('/api/v1/users/me/categories/42')
      .set(headers)
      .send({ color: 'ultraviolet' });

    expect(wrongType.status).toBe(400);
    expect(errorCode(wrongType)).toBe('VALIDATION_FAILED');
    expect(overlong.status).toBe(400);
    expect(errorCode(overlong)).toBe('VALIDATION_FAILED');
    expect(unsupportedColor.status).toBe(400);
    expect(errorCode(unsupportedColor)).toBe('VALIDATION_FAILED');
    expect(unknownColor.status).toBe(400);
    expect(errorCode(unknownColor)).toBe('VALIDATION_FAILED');
  });

  it('includes Category descriptions in create, list, get, and update responses', async () => {
    const described = categoryRecord({
      id: '100',
      description: 'Food staples',
      color: 'teal',
    });
    categoriesService.createCategory.mockResolvedValue(described);
    categoriesService.listCategories.mockResolvedValue([described]);
    categoriesService.getCategory.mockResolvedValue(described);
    categoriesService.updateCategory.mockResolvedValue(described);
    const headers = {
      Authorization: 'Bearer token-c',
      Accept: 'application/json',
    };

    const responses = await Promise.all([
      request(testHttpServer())
        .post('/api/v1/users/me/categories')
        .set(headers)
        .send({ name: 'Groceries', description: null }),
      request(testHttpServer()).get('/api/v1/users/me/categories').set(headers),
      request(testHttpServer())
        .get('/api/v1/users/me/categories/100')
        .set(headers),
      request(testHttpServer())
        .patch('/api/v1/users/me/categories/100')
        .set(headers)
        .send({ description: '  Food staples  ' }),
    ]);

    const createdBody = categoryBody(responses[0]);
    const listedBody = categoryListBody(responses[1])[0];
    const fetchedBody = categoryBody(responses[2]);
    const updatedBody = categoryBody(responses[3]);
    expect(createdBody.description).toBe('Food staples');
    expect(listedBody?.description).toBe('Food staples');
    expect(fetchedBody.description).toBe('Food staples');
    expect(updatedBody.description).toBe('Food staples');
    expect([
      createdBody.color,
      listedBody?.color,
      fetchedBody.color,
      updatedBody.color,
    ]).toEqual(['teal', 'teal', 'teal', 'teal']);
    expect(categoriesService.createCategory).toHaveBeenCalledWith(
      expect.any(String),
      { name: 'Groceries', description: null },
    );
    expect(categoriesService.updateCategory).toHaveBeenCalledWith(
      expect.any(String),
      '100',
      { description: 'Food staples' },
    );
  });

  it('routes budget creation through the authenticated User self route', async () => {
    const userId = ensureAlternateUser();
    const response = await request(testHttpServer())
      .put('/api/v1/users/me/categories/100/budget')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ amount: '250.00', period: 'monthly' });

    expect(response.status).toBe(201);
    expect(budgetsService.putBudget).toHaveBeenCalledWith(userId, '100', {
      amount: '250.00',
      period: 'monthly',
    });
    expect(response.headers.location).toBe(
      '/api/v1/users/me/categories/100/budget',
    );
  });

  it('passes only the authenticated local User ID to every transaction operation', async () => {
    const userId = ensureAlternateUser();
    const createResponse = await request(testHttpServer())
      .post('/api/v1/users/me/transactions')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        categoryId: '100',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      });
    const listResponse = await request(testHttpServer())
      .get('/api/v1/users/me/transactions')
      .query({ fromDate: '2026-08-01', pageSize: '10' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await request(testHttpServer())
      .get('/api/v1/users/me/transactions/300')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const updateResponse = await request(testHttpServer())
      .patch('/api/v1/users/me/transactions/301')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ categoryId: '100' });
    const deleteResponse = await request(testHttpServer())
      .delete('/api/v1/users/me/transactions/300')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(204);
    expect(transactionsService.createManualTransaction).toHaveBeenCalledWith(
      userId,
      {
        categoryId: '100',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    );
    expect(transactionsService.listTransactions).toHaveBeenCalledWith(userId, {
      fromDate: '2026-08-01',
      pageSize: 10,
    });
    expect(transactionsService.getManualTransaction).toHaveBeenCalledWith(
      userId,
      '300',
    );
    expect(transactionsService.updateTransaction).toHaveBeenCalledWith(
      userId,
      '301',
      { categoryId: '100' },
    );
    expect(transactionsService.deleteManualTransaction).toHaveBeenCalledWith(
      userId,
      '300',
    );
    expect(createResponse.headers.location).toBe(
      '/api/v1/users/me/transactions/300',
    );
    expect(updateResponse.body).toMatchObject({
      id: '301',
      source: 'imported',
      categoryId: '100',
    });
  });

  it('does not treat caller-supplied User IDs as transaction ownership', async () => {
    const userId = ensureAlternateUser();
    transactionsService.createManualTransaction.mockClear();
    transactionsService.listTransactions.mockClear();
    transactionsService.getManualTransaction.mockClear();
    transactionsService.updateTransaction.mockClear();
    transactionsService.deleteManualTransaction.mockClear();

    const createResponse = await request(testHttpServer())
      .post('/api/v1/users/me/transactions')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({
        userId: '8',
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      });
    const listResponse = await request(testHttpServer())
      .get('/api/v1/users/me/transactions')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await request(testHttpServer())
      .get('/api/v1/users/me/transactions/300')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const updateResponse = await request(testHttpServer())
      .patch('/api/v1/users/me/transactions/300')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ categoryId: '100', userId: '8' });
    const deleteResponse = await request(testHttpServer())
      .delete('/api/v1/users/me/transactions/300')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(createResponse.status).toBe(400);
    expect(listResponse.status).toBe(400);
    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(204);
    expect(transactionsService.createManualTransaction).not.toHaveBeenCalled();
    expect(transactionsService.listTransactions).not.toHaveBeenCalled();
    expect(transactionsService.updateTransaction).not.toHaveBeenCalled();
    expect(transactionsService.getManualTransaction).toHaveBeenCalledWith(
      userId,
      '300',
    );
    expect(transactionsService.deleteManualTransaction).toHaveBeenCalledWith(
      userId,
      '300',
    );
  });

  it('returns the same non-disclosing 404 for absent and cross-user transaction identifiers', async () => {
    const userId = ensureAlternateUser();
    const originalGet = transactionsService.getManualTransaction;
    const originalUpdate = transactionsService.updateTransaction;
    const originalDelete = transactionsService.deleteManualTransaction;
    const notFound = () => Promise.reject(new TransactionNotFoundError());
    transactionsService.getManualTransaction = jest.fn(
      (requestUserId: string, transactionId: string) =>
        requestUserId === userId && transactionId === '300'
          ? Promise.resolve(transactionRecord({ id: '300', userId }))
          : notFound(),
    );
    transactionsService.updateTransaction = jest.fn(
      (requestUserId: string, transactionId: string) =>
        requestUserId === userId && transactionId === '301'
          ? Promise.resolve(importedTransactionRecord({ id: '301', userId }))
          : notFound(),
    );
    transactionsService.deleteManualTransaction = jest.fn(
      (requestUserId: string, transactionId: string) =>
        requestUserId === userId && transactionId === '300'
          ? Promise.resolve()
          : notFound(),
    );

    try {
      const absentGet = await request(testHttpServer())
        .get('/api/v1/users/me/transactions/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserGet = await request(testHttpServer())
        .get('/api/v1/users/me/transactions/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const absentUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/transactions/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '100' });
      const crossUserUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/transactions/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '100' });
      const absentDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/transactions/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/transactions/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');

      expect(absentGet.status).toBe(404);
      expect(crossUserGet.status).toBe(404);
      expect(crossUserGet.body).toEqual(absentGet.body);
      expect(absentUpdate.status).toBe(404);
      expect(crossUserUpdate.status).toBe(404);
      expect(crossUserUpdate.body).toEqual(absentUpdate.body);
      expect(absentDelete.status).toBe(404);
      expect(crossUserDelete.status).toBe(404);
      expect(crossUserDelete.body).toEqual(absentDelete.body);
    } finally {
      transactionsService.getManualTransaction = originalGet;
      transactionsService.updateTransaction = originalUpdate;
      transactionsService.deleteManualTransaction = originalDelete;
    }
  });

  it('keeps transaction category and imported-transaction associations within the authenticated User', async () => {
    const userId = ensureAlternateUser();
    const originalCreate = transactionsService.createManualTransaction;
    const originalUpdate = transactionsService.updateTransaction;
    const categoryNotFound = () => Promise.reject(new CategoryNotFoundError());
    const transactionNotFound = () =>
      Promise.reject(new TransactionNotFoundError());
    transactionsService.createManualTransaction = jest.fn(
      (requestUserId: string, input: { categoryId?: string | null }) =>
        requestUserId !== userId || input.categoryId === '8'
          ? categoryNotFound()
          : Promise.resolve(transactionRecord({ id: '302', userId })),
    );
    transactionsService.updateTransaction = jest.fn(
      (
        requestUserId: string,
        transactionId: string,
        input: { categoryId?: string | null },
      ) => {
        if (requestUserId !== userId || transactionId === '8') {
          return transactionNotFound();
        }
        if (input.categoryId === '8') {
          return categoryNotFound();
        }

        return Promise.resolve(
          importedTransactionRecord({ id: transactionId, userId }),
        );
      },
    );

    try {
      const crossUserCategory = await request(testHttpServer())
        .post('/api/v1/users/me/transactions')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({
          categoryId: '8',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        });
      const crossUserCategoryOnImported = await request(testHttpServer())
        .patch('/api/v1/users/me/transactions/301')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '8' });
      const crossUserImportedTransaction = await request(testHttpServer())
        .patch('/api/v1/users/me/transactions/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '100' });

      expect(crossUserCategory.status).toBe(404);
      expect(errorCode(crossUserCategory)).toBe('CATEGORY_NOT_FOUND');
      expect(crossUserCategoryOnImported.status).toBe(404);
      expect(errorCode(crossUserCategoryOnImported)).toBe('CATEGORY_NOT_FOUND');
      expect(crossUserImportedTransaction.status).toBe(404);
      expect(errorCode(crossUserImportedTransaction)).toBe(
        'TRANSACTION_NOT_FOUND',
      );
      expect(transactionsService.createManualTransaction).toHaveBeenCalledWith(
        userId,
        {
          categoryId: '8',
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
      );
      expect(transactionsService.updateTransaction).toHaveBeenNthCalledWith(
        1,
        userId,
        '301',
        { categoryId: '8' },
      );
      expect(transactionsService.updateTransaction).toHaveBeenNthCalledWith(
        2,
        userId,
        '8',
        { categoryId: '100' },
      );
    } finally {
      transactionsService.createManualTransaction = originalCreate;
      transactionsService.updateTransaction = originalUpdate;
    }
  });

  it('passes the trusted local User ID to every category-rule operation', async () => {
    const userId = ensureAlternateUser();
    const createResponse = await request(testHttpServer())
      .post('/api/v1/users/me/category-rules')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ pattern: 'Coffee Shop', categoryId: '100' });
    const listResponse = await request(testHttpServer())
      .get('/api/v1/users/me/category-rules')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await request(testHttpServer())
      .get('/api/v1/users/me/category-rules/200')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const updateResponse = await request(testHttpServer())
      .patch('/api/v1/users/me/category-rules/200')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ pattern: 'Coffee  Shop' });
    const deleteResponse = await request(testHttpServer())
      .delete('/api/v1/users/me/category-rules/200')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(204);
    expect(categoryRulesService.createCategoryRule).toHaveBeenCalledWith(
      userId,
      { pattern: 'Coffee Shop', categoryId: '100' },
    );
    expect(categoryRulesService.listCategoryRules).toHaveBeenCalledWith(userId);
    expect(categoryRulesService.getCategoryRule).toHaveBeenCalledWith(
      userId,
      '200',
    );
    expect(categoryRulesService.updateCategoryRule).toHaveBeenCalledWith(
      userId,
      '200',
      { pattern: 'Coffee  Shop' },
    );
    expect(categoryRulesService.deleteCategoryRule).toHaveBeenCalledWith(
      userId,
      '200',
    );
    expect(createResponse.headers.location).toBe(
      '/api/v1/users/me/category-rules/200',
    );
  });

  it('routes category summaries through the authenticated User self route', async () => {
    const userId = ensureAlternateUser();
    const response = await request(testHttpServer())
      .get('/api/v1/users/me/category-summaries')
      .query({ period: 'monthly', year: '2026', month: '08' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(categorySummariesService.getCategorySummary).toHaveBeenCalledWith(
      userId,
      {
        period: 'monthly',
        year: '2026',
        month: '08',
      },
    );
  });

  it('passes the trusted local User ID to category item operations', async () => {
    const userId = ensureAlternateUser();
    const listResponse = await request(testHttpServer())
      .get('/api/v1/users/me/categories')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const getResponse = await request(testHttpServer())
      .get('/api/v1/users/me/categories/100')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const updateResponse = await request(testHttpServer())
      .patch('/api/v1/users/me/categories/100')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ isActive: false });

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(categoriesService.listCategories).toHaveBeenCalledWith(userId);
    expect(categoriesService.getCategory).toHaveBeenCalledWith(userId, '100');
    expect(categoriesService.updateCategory).toHaveBeenCalledWith(
      userId,
      '100',
      {
        isActive: false,
      },
    );
  });

  it('passes the trusted local User ID to budget read and delete operations', async () => {
    const userId = ensureAlternateUser();
    const getResponse = await request(testHttpServer())
      .get('/api/v1/users/me/categories/100/budget')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const deleteResponse = await request(testHttpServer())
      .delete('/api/v1/users/me/categories/100/budget')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(getResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(204);
    expect(budgetsService.getBudget).toHaveBeenCalledWith(userId, '100');
    expect(budgetsService.deleteBudget).toHaveBeenCalledWith(userId, '100');
  });

  it('rejects caller-supplied User IDs instead of treating them as ownership', async () => {
    const userId = ensureAlternateUser();
    const categoryResponse = await request(testHttpServer())
      .post('/api/v1/users/me/categories')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ name: 'Groceries', userId: '8' });
    const budgetResponse = await request(testHttpServer())
      .put('/api/v1/users/me/categories/100/budget')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ amount: '250.00', period: 'monthly', userId: '8' });
    const categoryUpdateResponse = await request(testHttpServer())
      .patch('/api/v1/users/me/categories/100')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ isActive: false, userId: '8' });
    const summaryResponse = await request(testHttpServer())
      .get('/api/v1/users/me/category-summaries')
      .query({ period: 'monthly', year: '2026', month: '08', userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const categoryListWithUserId = await request(testHttpServer())
      .get('/api/v1/users/me/categories')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const categoryGetWithUserId = await request(testHttpServer())
      .get('/api/v1/users/me/categories/100')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const budgetGetWithUserId = await request(testHttpServer())
      .get('/api/v1/users/me/categories/100/budget')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const budgetDeleteWithUserId = await request(testHttpServer())
      .delete('/api/v1/users/me/categories/100/budget')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const categoryRuleCreateWithUserId = await request(testHttpServer())
      .post('/api/v1/users/me/category-rules')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ pattern: 'Coffee Shop', categoryId: '100', userId: '8' });
    const categoryRuleUpdateWithUserId = await request(testHttpServer())
      .patch('/api/v1/users/me/category-rules/200')
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json')
      .send({ pattern: 'Coffee Shop', userId: '8' });
    const categoryRuleListWithUserId = await request(testHttpServer())
      .get('/api/v1/users/me/category-rules')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const categoryRuleGetWithUserId = await request(testHttpServer())
      .get('/api/v1/users/me/category-rules/200')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');
    const categoryRuleDeleteWithUserId = await request(testHttpServer())
      .delete('/api/v1/users/me/category-rules/200')
      .query({ userId: '8' })
      .set('Authorization', 'Bearer token-c')
      .set('Accept', 'application/json');

    expect(categoryResponse.status).toBe(400);
    expect(budgetResponse.status).toBe(400);
    expect(categoryUpdateResponse.status).toBe(400);
    expect(summaryResponse.status).toBe(400);
    expect(categoryListWithUserId.status).toBe(200);
    expect(categoryGetWithUserId.status).toBe(200);
    expect(budgetGetWithUserId.status).toBe(200);
    expect(budgetDeleteWithUserId.status).toBe(204);
    expect(categoryRuleCreateWithUserId.status).toBe(400);
    expect(categoryRuleUpdateWithUserId.status).toBe(400);
    expect(categoryRuleListWithUserId.status).toBe(200);
    expect(categoryRuleGetWithUserId.status).toBe(200);
    expect(categoryRuleDeleteWithUserId.status).toBe(204);
    expect(categoriesService.listCategories).toHaveBeenLastCalledWith(userId);
    expect(categoriesService.getCategory).toHaveBeenLastCalledWith(
      userId,
      '100',
    );
    expect(budgetsService.getBudget).toHaveBeenLastCalledWith(userId, '100');
    expect(budgetsService.deleteBudget).toHaveBeenLastCalledWith(userId, '100');
    expect(categoryRulesService.listCategoryRules).toHaveBeenLastCalledWith(
      userId,
    );
    expect(categoryRulesService.getCategoryRule).toHaveBeenLastCalledWith(
      userId,
      '200',
    );
    expect(categoryRulesService.deleteCategoryRule).toHaveBeenLastCalledWith(
      userId,
      '200',
    );
  });

  it.each([
    [
      'category collection read',
      'GET',
      '/api/v1/users/8/categories',
      undefined,
    ],
    [
      'transaction collection read',
      'GET',
      '/api/v1/users/8/transactions',
      undefined,
    ],
    [
      'transaction collection write',
      'POST',
      '/api/v1/users/8/transactions',
      { purchaseDate: '2026-08-01', description: 'Coffee', amount: '4.50' },
    ],
    [
      'transaction item read',
      'GET',
      '/api/v1/users/8/transactions/300',
      undefined,
    ],
    [
      'transaction item write',
      'PATCH',
      '/api/v1/users/8/transactions/300',
      { categoryId: null },
    ],
    [
      'transaction item delete',
      'DELETE',
      '/api/v1/users/8/transactions/300',
      undefined,
    ],
    [
      'category collection write',
      'POST',
      '/api/v1/users/8/categories',
      { name: 'Groceries' },
    ],
    ['category item read', 'GET', '/api/v1/users/8/categories/100', undefined],
    [
      'category item write',
      'PATCH',
      '/api/v1/users/8/categories/100',
      { isActive: false },
    ],
    ['budget read', 'GET', '/api/v1/users/8/categories/100/budget', undefined],
    [
      'budget write',
      'PUT',
      '/api/v1/users/8/categories/100/budget',
      { amount: '250.00', period: 'monthly' },
    ],
    [
      'budget delete',
      'DELETE',
      '/api/v1/users/8/categories/100/budget',
      undefined,
    ],
    [
      'category summaries',
      'GET',
      '/api/v1/users/8/category-summaries',
      undefined,
    ],
    [
      'category rule collection read',
      'GET',
      '/api/v1/users/8/category-rules',
      undefined,
    ],
    [
      'category rule collection write',
      'POST',
      '/api/v1/users/8/category-rules',
      { pattern: 'Groceries', categoryId: '100' },
    ],
    [
      'category rule item read',
      'GET',
      '/api/v1/users/8/category-rules/200',
      undefined,
    ],
    [
      'category rule item write',
      'PATCH',
      '/api/v1/users/8/category-rules/200',
      { pattern: 'Groceries' },
    ],
    [
      'category rule delete',
      'DELETE',
      '/api/v1/users/8/category-rules/200',
      undefined,
    ],
  ] as const)(
    'does not expose the legacy %s route',
    async (_name, method, path, body) => {
      const pending = requestWithMethod(method, path)
        .set('Authorization', 'Bearer token-a')
        .set('Accept', 'application/json');
      if (body !== undefined) {
        pending.send(body);
      }

      const response = await pending;

      expect(response.status).toBe(404);
    },
  );

  it('returns the same non-disclosing 404 for absent and cross-user category and budget references', async () => {
    const userId = ensureAlternateUser();
    const categoriesById = new Map([
      ['100', categoryRecord({ id: '100', userId })],
      ['8', categoryRecord({ id: '8', userId: '8' })],
    ]);
    const originalGetCategory = categoriesService.getCategory;
    const originalUpdateCategory = categoriesService.updateCategory;
    const originalGetBudget = budgetsService.getBudget;
    const originalPutBudget = budgetsService.putBudget;
    const originalDeleteBudget = budgetsService.deleteBudget;
    const findOwnedCategory = (requestUserId: string, categoryId: string) => {
      const category = categoriesById.get(categoryId);
      return category?.userId === requestUserId ? category : undefined;
    };
    const notFound = () => Promise.reject(new CategoryNotFoundError());
    categoriesService.getCategory = jest.fn(
      (requestUserId: string, categoryId: string) => {
        const category = findOwnedCategory(requestUserId, categoryId);
        return category === undefined ? notFound() : Promise.resolve(category);
      },
    );
    categoriesService.updateCategory = jest.fn(
      (requestUserId: string, categoryId: string) => {
        const category = findOwnedCategory(requestUserId, categoryId);
        return category === undefined ? notFound() : Promise.resolve(category);
      },
    );
    budgetsService.getBudget = jest.fn(
      (requestUserId: string, categoryId: string) => {
        return findOwnedCategory(requestUserId, categoryId) === undefined
          ? notFound()
          : Promise.resolve(budgetRecord(categoryId));
      },
    );
    budgetsService.putBudget = jest.fn(
      (requestUserId: string, categoryId: string) => {
        return findOwnedCategory(requestUserId, categoryId) === undefined
          ? notFound()
          : Promise.resolve({
              budget: budgetRecord(categoryId),
              created: true,
            });
      },
    );
    budgetsService.deleteBudget = jest.fn(
      (requestUserId: string, categoryId: string) => {
        return findOwnedCategory(requestUserId, categoryId) === undefined
          ? notFound()
          : Promise.resolve();
      },
    );

    try {
      const absentCategory = await request(testHttpServer())
        .get('/api/v1/users/me/categories/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserCategory = await request(testHttpServer())
        .get('/api/v1/users/me/categories/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const absentCategoryUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/categories/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ isActive: false });
      const crossUserCategoryUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/categories/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ isActive: false });
      const absentBudget = await request(testHttpServer())
        .get('/api/v1/users/me/categories/404/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserBudget = await request(testHttpServer())
        .get('/api/v1/users/me/categories/8/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const absentBudgetPut = await request(testHttpServer())
        .put('/api/v1/users/me/categories/404/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ amount: '250.00', period: 'monthly' });
      const crossUserBudgetPut = await request(testHttpServer())
        .put('/api/v1/users/me/categories/8/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ amount: '250.00', period: 'monthly' });
      const absentBudgetDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/categories/404/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserBudgetDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/categories/8/budget')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');

      expect(absentCategory.status).toBe(404);
      expect(crossUserCategory.status).toBe(404);
      expect(crossUserCategory.body).toEqual(absentCategory.body);
      expect(absentCategoryUpdate.status).toBe(404);
      expect(crossUserCategoryUpdate.status).toBe(404);
      expect(crossUserCategoryUpdate.body).toEqual(absentCategoryUpdate.body);
      expect(absentBudget.status).toBe(404);
      expect(crossUserBudget.status).toBe(404);
      expect(crossUserBudget.body).toEqual(absentBudget.body);
      expect(absentBudgetPut.status).toBe(404);
      expect(crossUserBudgetPut.status).toBe(404);
      expect(crossUserBudgetPut.body).toEqual(absentBudgetPut.body);
      expect(absentBudgetDelete.status).toBe(404);
      expect(crossUserBudgetDelete.status).toBe(404);
      expect(crossUserBudgetDelete.body).toEqual(absentBudgetDelete.body);
    } finally {
      categoriesService.getCategory = originalGetCategory;
      categoriesService.updateCategory = originalUpdateCategory;
      budgetsService.getBudget = originalGetBudget;
      budgetsService.putBudget = originalPutBudget;
      budgetsService.deleteBudget = originalDeleteBudget;
    }
  });

  it('returns the same non-disclosing 404 for absent and cross-user category-rule references', async () => {
    const userId = ensureAlternateUser();
    const rulesById = new Map([
      ['200', categoryRuleRecord({ id: '200', userId })],
      ['8', categoryRuleRecord({ id: '8', userId: '8' })],
    ]);
    const originalCreate = categoryRulesService.createCategoryRule;
    const originalGet = categoryRulesService.getCategoryRule;
    const originalUpdate = categoryRulesService.updateCategoryRule;
    const originalDelete = categoryRulesService.deleteCategoryRule;
    const findOwnedRule = (requestUserId: string, ruleId: string) => {
      const rule = rulesById.get(ruleId);
      return rule?.userId === requestUserId ? rule : undefined;
    };
    const ruleNotFound = () => Promise.reject(new CategoryRuleNotFoundError());
    const categoryNotFound = () => Promise.reject(new CategoryNotFoundError());
    categoryRulesService.createCategoryRule = jest.fn(
      (requestUserId: string, input: { categoryId: string }) => {
        return requestUserId === userId && input.categoryId === '100'
          ? Promise.resolve(categoryRuleRecord({ id: '201', userId }))
          : categoryNotFound();
      },
    );
    categoryRulesService.getCategoryRule = jest.fn(
      (requestUserId: string, ruleId: string) => {
        const rule = findOwnedRule(requestUserId, ruleId);
        return rule === undefined ? ruleNotFound() : Promise.resolve(rule);
      },
    );
    categoryRulesService.updateCategoryRule = jest.fn(
      (
        requestUserId: string,
        ruleId: string,
        input: { categoryId?: string; pattern?: string },
      ) => {
        const rule = findOwnedRule(requestUserId, ruleId);
        if (rule === undefined) return ruleNotFound();
        if (input.categoryId !== undefined && input.categoryId !== '100') {
          return categoryNotFound();
        }
        return Promise.resolve({ ...rule, ...input });
      },
    );
    categoryRulesService.deleteCategoryRule = jest.fn(
      (requestUserId: string, ruleId: string) => {
        return findOwnedRule(requestUserId, ruleId) === undefined
          ? ruleNotFound()
          : Promise.resolve();
      },
    );

    try {
      const absentGet = await request(testHttpServer())
        .get('/api/v1/users/me/category-rules/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserGet = await request(testHttpServer())
        .get('/api/v1/users/me/category-rules/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const absentUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/category-rules/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ pattern: 'Updated' });
      const crossUserUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/category-rules/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ pattern: 'Updated' });
      const absentDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/category-rules/404')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const crossUserDelete = await request(testHttpServer())
        .delete('/api/v1/users/me/category-rules/8')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json');
      const absentCreate = await request(testHttpServer())
        .post('/api/v1/users/me/category-rules')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ pattern: 'Groceries', categoryId: '404' });
      const crossUserCreate = await request(testHttpServer())
        .post('/api/v1/users/me/category-rules')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ pattern: 'Groceries', categoryId: '8' });
      const absentCategoryUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/category-rules/200')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '404' });
      const crossUserCategoryUpdate = await request(testHttpServer())
        .patch('/api/v1/users/me/category-rules/200')
        .set('Authorization', 'Bearer token-c')
        .set('Accept', 'application/json')
        .send({ categoryId: '8' });

      expect(absentGet.status).toBe(404);
      expect(crossUserGet.status).toBe(404);
      expect(crossUserGet.body).toEqual(absentGet.body);
      expect(absentUpdate.status).toBe(404);
      expect(crossUserUpdate.status).toBe(404);
      expect(crossUserUpdate.body).toEqual(absentUpdate.body);
      expect(absentDelete.status).toBe(404);
      expect(crossUserDelete.status).toBe(404);
      expect(crossUserDelete.body).toEqual(absentDelete.body);
      expect(absentCreate.status).toBe(404);
      expect(crossUserCreate.status).toBe(404);
      expect(crossUserCreate.body).toEqual(absentCreate.body);
      expect(absentCategoryUpdate.status).toBe(404);
      expect(crossUserCategoryUpdate.status).toBe(404);
      expect(crossUserCategoryUpdate.body).toEqual(absentCategoryUpdate.body);
    } finally {
      categoryRulesService.createCategoryRule = originalCreate;
      categoryRulesService.getCategoryRule = originalGet;
      categoryRulesService.updateCategoryRule = originalUpdate;
      categoryRulesService.deleteCategoryRule = originalDelete;
    }
  });

  it.each([
    [
      'category rule collection read',
      'GET',
      '/api/v1/users/me/category-rules',
      undefined,
    ],
    [
      'category rule collection write',
      'POST',
      '/api/v1/users/me/category-rules',
      { pattern: 'Groceries', categoryId: '100' },
    ],
    [
      'category rule item read',
      'GET',
      '/api/v1/users/me/category-rules/200',
      undefined,
    ],
    [
      'category rule item write',
      'PATCH',
      '/api/v1/users/me/category-rules/200',
      { pattern: 'Groceries' },
    ],
    [
      'category rule delete',
      'DELETE',
      '/api/v1/users/me/category-rules/200',
      undefined,
    ],
    [
      'transaction collection read',
      'GET',
      '/api/v1/users/me/transactions',
      undefined,
    ],
    [
      'transaction collection write',
      'POST',
      '/api/v1/users/me/transactions',
      { purchaseDate: '2026-08-01', description: 'Coffee', amount: '4.50' },
    ],
    [
      'transaction item read',
      'GET',
      '/api/v1/users/me/transactions/300',
      undefined,
    ],
    [
      'transaction item write',
      'PATCH',
      '/api/v1/users/me/transactions/300',
      { categoryId: null },
    ],
    [
      'transaction item delete',
      'DELETE',
      '/api/v1/users/me/transactions/300',
      undefined,
    ],
  ] as const)(
    'returns 403 for an authenticated but unprovisioned caller on %s',
    async (_name, method, path, body) => {
      const pending = requestWithMethod(method, path)
        .set('Authorization', 'Bearer token-b')
        .set('Accept', 'application/json');
      if (body !== undefined) {
        pending.send(body);
      }

      const response = await pending;

      expect(response.status).toBe(403);
    },
  );

  it.each([
    ['my profile', 'GET', '/api/v1/users/me'],
    ['my categories', 'GET', '/api/v1/users/me/categories'],
    ['my category', 'GET', '/api/v1/users/me/categories/1'],
    ['my budget', 'GET', '/api/v1/users/me/categories/1/budget'],
    ['my category rules', 'GET', '/api/v1/users/me/category-rules'],
    ['my category rule', 'GET', '/api/v1/users/me/category-rules/1'],
    ['my transactions', 'GET', '/api/v1/users/me/transactions'],
    ['my transaction', 'GET', '/api/v1/users/me/transactions/1'],
    ['my statement imports', 'GET', '/api/v1/users/me/statement-imports'],
    ['my statement import', 'GET', '/api/v1/users/me/statement-imports/1'],
    ['my category summaries', 'GET', '/api/v1/users/me/category-summaries'],
  ])('denies an anonymous request to %s', async (_name, method, path) => {
    const response = await request(testHttpServer())
      [method.toLowerCase() as 'get'](path)
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
  });

  it('returns Bearer authentication metadata for an anonymous User fetch', async () => {
    const response = await request(testHttpServer())
      .get('/api/v1/users/me')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns Bearer authentication metadata for anonymous bodyless provisioning', async () => {
    const response = await request(testHttpServer())
      .put('/api/v1/users/me')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns a not-found response for a missing Clerk profile', async () => {
    profileService.profile = null;

    const response = await putMyUser({});

    expect(response.status).toBe(404);
    expect(errorCode(response)).toBe('USER_NOT_FOUND');
  });

  it('rejects a Clerk profile without a primary verified email', async () => {
    profileService.profile = {
      fullName: 'Incomplete User',
      primaryVerifiedEmail: null,
    };

    const response = await putMyUser({}, 'token-b');

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_FAILED');
    await expect(userStore.findByClerkUserId('user_b')).resolves.toBeNull();
  });

  it('returns service-unavailable without exposing provider details', async () => {
    profileService.error = new Error('provider secret and response body');

    const response = await putMyUser({});

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The identity provider is temporarily unavailable',
        details: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('provider secret');
  });
});

class FakeClerkTokenVerifier implements ClerkTokenVerifier {
  verify(token: string): Promise<ClerkSession> {
    if (token === 'token-a') {
      return Promise.resolve(session('user_a'));
    }
    if (token === 'token-b') {
      return Promise.resolve(session('user_b'));
    }
    if (token === 'token-c') {
      return Promise.resolve(session('user_c'));
    }
    if (token === 'token-d') {
      return Promise.resolve(session('user_d'));
    }
    return Promise.reject(new Error('invalid token'));
  }
}

class FakeClerkProfileService implements ClerkProfileService {
  readonly requestedClerkUserIds: string[] = [];
  profile: ClerkUserProfile | null;
  error: Error | undefined;

  constructor(profile: ClerkUserProfile | null) {
    this.profile = profile;
  }

  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    this.requestedClerkUserIds.push(clerkUserId);
    if (this.error) return Promise.reject(this.error);
    if (clerkUserId === 'user_d') {
      return Promise.resolve({
        fullName: 'Grace Hopper',
        primaryVerifiedEmail: 'grace@example.com',
      });
    }
    return Promise.resolve(this.profile);
  }
}

class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, UserRecord>();
  private nextId = 42;

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.id === id) ?? null,
    );
  }

  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(clerkUserId) ?? null);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.email === email) ?? null,
    );
  }

  create(input: NewUser): Promise<UserRecord> {
    return Promise.resolve(this.createWithId(String(this.nextId++), input));
  }

  createWithId(id: string, input: NewUser): UserRecord {
    const timestamp = new Date('2026-08-31T00:00:00.000Z');
    const user = {
      id,
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(user.clerkUserId, user);
    return user;
  }

  update(id: string, input: UpdateUser): Promise<UserRecord | null> {
    const current = [...this.users.values()].find((user) => user.id === id);
    if (!current) return Promise.resolve(null);

    const updated = { ...current, ...input };
    this.users.set(updated.clerkUserId, updated);
    return Promise.resolve(updated);
  }
}

class InMemoryDefaultCategoryStore implements CategoryStore {
  private readonly categories: CategoryRecord[] = [];

  create(input: NewCategory): Promise<CategoryRecord> {
    const category = categoryRecord({
      ...input,
      id: String(this.categories.length + 1),
    });
    this.categories.push(category);
    return Promise.resolve(category);
  }

  findAll(userId: string): Promise<CategoryRecord[]> {
    return Promise.resolve(
      this.categories.filter((category) => category.userId === userId),
    );
  }

  findById(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
  }

  findByNormalizedName(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
  }

  update(): Promise<CategoryRecord | null> {
    throw new Error('Not used');
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

function session(userId: string): ClerkSession {
  return { userId, sessionId: `${userId}_session`, claims: { sub: userId } };
}

interface TestCategoryRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color: CategoryRecord['color'];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function categoryRecord(
  overrides: Partial<TestCategoryRecord> = {},
): TestCategoryRecord {
  const timestamp = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: '42',
    userId: '42',
    name: 'Groceries',
    description: null,
    color: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

interface CategoryResponseBody {
  color: string;
  description: string | null;
}

function categoryBody(response: { body: unknown }): CategoryResponseBody {
  return response.body as CategoryResponseBody;
}

function categoryListBody(response: { body: unknown }): CategoryResponseBody[] {
  return response.body as CategoryResponseBody[];
}

function categoryRuleRecord(
  overrides: Partial<CategoryRuleRecord> = {},
): CategoryRuleRecord {
  const timestamp = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: '200',
    userId: '99',
    categoryId: '100',
    pattern: 'Groceries',
    normalizedPattern: 'groceries',
    matchType: 'exact',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function budgetRecord(categoryId = '42') {
  const timestamp = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: '100',
    categoryId,
    amount: '250.00',
    period: 'monthly' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function categorySummaryRecord() {
  return {
    period: 'monthly' as const,
    year: '2026',
    month: '08',
    categories: [],
    uncategorizedTotal: '0.00',
    uncategorizedCount: '0',
  };
}

function transactionRecord(
  overrides: Partial<ManualTransactionRecord> = {},
): ManualTransactionRecord {
  const timestamp = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: '300',
    userId: '99',
    categoryId: '100',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function transactionPageRecord(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    ...transactionRecord(),
    statementImportId: null,
    ...overrides,
  };
}

function importedTransactionRecord(
  overrides: Partial<ImportedTransactionRecord> = {},
): ImportedTransactionRecord {
  return {
    id: '301',
    userId: '99',
    categoryId: '100',
    statementImportId: '500',
    purchaseDate: '2026-08-02',
    description: 'Market',
    amount: '25.00',
    categoryMatchConfidence: null,
    importFingerprint: 'a'.repeat(64),
    source: 'imported',
    createdAt: new Date('2026-08-31T00:00:00.000Z'),
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    ...overrides,
  };
}

function putMyUser(body: object, token = 'token-a') {
  return request(testHttpServer())
    .put('/api/v1/users/me')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json')
    .send(body);
}

function getMyUser() {
  return request(testHttpServer())
    .get('/api/v1/users/me')
    .set('Authorization', 'Bearer token-a')
    .set('Accept', 'application/json');
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

function testHttpServer(): Server {
  return application.getHttpServer() as Server;
}

type LegacyHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function requestWithMethod(method: LegacyHttpMethod, path: string) {
  const client = request(testHttpServer());
  switch (method) {
    case 'GET':
      return client.get(path);
    case 'POST':
      return client.post(path);
    case 'PATCH':
      return client.patch(path);
    case 'PUT':
      return client.put(path);
    case 'DELETE':
      return client.delete(path);
  }
}

function errorCode(response: { body: unknown }): string {
  const body = response.body;
  if (!isRecord(body) || !isRecord(body.error)) {
    throw new Error('Expected an error response');
  }

  const code = body.error.code;
  if (typeof code !== 'string') {
    throw new Error('Expected an error code');
  }

  return code;
}

function userResponseBody(response: { body: unknown }): {
  id: string;
  name: string;
  email: string;
} {
  const body = response.body;
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.email !== 'string'
  ) {
    throw new Error('Expected a User response');
  }

  return { id: body.id, name: body.name, email: body.email };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
