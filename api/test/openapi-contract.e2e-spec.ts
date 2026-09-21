import Ajv from 'ajv';
import { isEmail } from 'class-validator';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { configureApp } from '../src/bootstrap';
import {
  CLERK_TOKEN_VERIFIER,
  type ClerkSession,
  type ClerkTokenVerifier,
} from '../src/authentication/authentication';
import { ClerkProfileUnavailableError } from '../src/authentication/authentication-errors';
import { ClerkAuthenticationGuard } from '../src/authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from '../src/authentication/provisioned-user.guard';
import { DATABASE_READINESS } from '../src/health/database-readiness';
import { isValidDomainDate } from '../src/http/domain-date';
import {
  MAX_REQUEST_BODY_SIZE,
  type AppConfig,
} from '../src/config/app-config';
import { ApplicationError } from '../src/errors/application-error';
import {
  CategoryNameConflictError,
  CategoryNotFoundError,
} from '../src/categories/application/category-errors';
import { CategorySummariesService } from '../src/categories/application/category-summaries.service';
import { CategoriesService } from '../src/categories/application/categories.service';
import { BudgetsService } from '../src/categories/application/budgets.service';
import type { CategorySummaryResult } from '../src/categories/application/category-summaries.service';
import type { CategoryRecord } from '../src/categories/application/category-store';
import type { BudgetRecord } from '../src/categories/application/budget-store';
import { CategoryRulesService } from '../src/category-rules/application/category-rules.service';
import type { CategoryRuleRecord } from '../src/category-rules/application/category-rule-store';
import { CategoryRulePatternConflictError } from '../src/category-rules/application/category-rule-errors';
import { TransactionsService } from '../src/transactions/application/transactions.service';
import type { ImportedTransactionRecord } from '../src/transactions/application/imported-transaction-store';
import type { ManualTransactionRecord } from '../src/transactions/application/transaction-store';
import { StatementImportsService } from '../src/statement-imports/application/statement-imports.service';
import { StatementImportProbableDuplicatesError } from '../src/statement-imports/application/statement-import-errors';
import type {
  StatementImportHistoryRecord,
  StatementImportRecord,
} from '../src/statement-imports/application/statement-import-store';
import { SpaceAccessService } from '../src/spaces/application/space-access.service';
import { UsersService } from '../src/users/application/users.service';
import {
  USER_STORE,
  type UserRecord,
} from '../src/users/application/user-store';
import type {
  OpenAPIObject,
  ReferenceObject,
  ResponseObject,
} from '@nestjs/swagger';
import { createOpenApiDocument } from '../src/docs/openapi-document.factory';
import { OpenApiModule } from '../src/docs/openapi.module';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type JsonSchema = Record<string, unknown>;

function invoke(mock: jest.Mock, ...args: unknown[]): Promise<unknown> {
  return Promise.resolve(mock(...args) as unknown);
}

describe('runtime responses against the generated OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let responseValidator: OpenApiResponseValidator;
  let verifier: FakeTokenVerifier;
  let readiness: { isReady: jest.Mock };
  let userStore: { findByClerkUserId: jest.Mock };
  let usersService: {
    provisionUser: jest.Mock;
    getUserById: jest.Mock;
  };
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
  let categorySummariesService: { getCategorySummary: jest.Mock };
  let categoryRulesService: {
    replaceCategoryRules: jest.Mock;
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
  let statementImportsService: {
    getStatementImport: jest.Mock;
    listStatementImports: jest.Mock;
    commitReviewedStatementImport: jest.Mock;
  };
  let spaceAccessService: {
    requirePersonalSpace: jest.Mock;
    requirePersonalWriteSpace: jest.Mock;
  };

  beforeAll(async () => {
    document = await createOpenApiDocument();
    responseValidator = new OpenApiResponseValidator(document);
    verifier = new FakeTokenVerifier();
    readiness = { isReady: jest.fn() };
    userStore = { findByClerkUserId: jest.fn() };
    usersService = {
      provisionUser: jest.fn(),
      getUserById: jest.fn(),
    };
    categoriesService = {
      createCategory: jest.fn(),
      listCategories: jest.fn(),
      getCategory: jest.fn(),
      updateCategory: jest.fn(),
    };
    budgetsService = {
      putBudget: jest.fn(),
      getBudget: jest.fn(),
      deleteBudget: jest.fn(),
    };
    categorySummariesService = { getCategorySummary: jest.fn() };
    categoryRulesService = {
      replaceCategoryRules: jest.fn(),
      createCategoryRule: jest.fn(),
      listCategoryRules: jest.fn(),
      getCategoryRule: jest.fn(),
      updateCategoryRule: jest.fn(),
      deleteCategoryRule: jest.fn(),
    };
    transactionsService = {
      createManualTransaction: jest.fn(),
      listTransactions: jest.fn(),
      getManualTransaction: jest.fn(),
      updateTransaction: jest.fn(),
      deleteManualTransaction: jest.fn(),
    };
    statementImportsService = {
      getStatementImport: jest.fn(),
      listStatementImports: jest.fn(),
      commitReviewedStatementImport: jest.fn(),
    };
    spaceAccessService = {
      requirePersonalSpace: jest.fn(),
      requirePersonalWriteSpace: jest.fn(),
    };
    Object.assign(categoriesService, {
      createCategoryInSpace: (_spaceId: string, input: unknown) =>
        invoke(categoriesService.createCategory, '7', input),
      listCategoriesInSpace: () =>
        invoke(categoriesService.listCategories, '7'),
      getCategoryInSpace: (_spaceId: string, id: string) =>
        invoke(categoriesService.getCategory, '7', id),
      updateCategoryInSpace: (_spaceId: string, id: string, input: unknown) =>
        invoke(categoriesService.updateCategory, '7', id, input),
    });
    Object.assign(budgetsService, {
      putBudgetInSpace: (_spaceId: string, id: string, input: unknown) =>
        invoke(budgetsService.putBudget, '7', id, input),
      getBudgetInSpace: (_spaceId: string, id: string) =>
        invoke(budgetsService.getBudget, '7', id),
      deleteBudgetInSpace: (_spaceId: string, id: string) =>
        invoke(budgetsService.deleteBudget, '7', id),
    });
    Object.assign(categorySummariesService, {
      getCategorySummaryInSpace: (_spaceId: string, query: unknown) =>
        invoke(categorySummariesService.getCategorySummary, '7', query),
    });
    Object.assign(categoryRulesService, {
      createCategoryRuleInSpace: (_spaceId: string, input: unknown) =>
        invoke(categoryRulesService.createCategoryRule, '7', input),
      listCategoryRulesInSpace: async () => ({
        rules: await invoke(categoryRulesService.listCategoryRules, '7'),
        revision: '0',
      }),
      getCategoryRuleInSpace: (_spaceId: string, id: string) =>
        invoke(categoryRulesService.getCategoryRule, '7', id),
      updateCategoryRuleInSpace: (
        _spaceId: string,
        id: string,
        input: unknown,
      ) => invoke(categoryRulesService.updateCategoryRule, '7', id, input),
      deleteCategoryRuleInSpace: (_spaceId: string, id: string) =>
        invoke(categoryRulesService.deleteCategoryRule, '7', id),
      replaceCategoryRulesInSpace: async (
        _spaceId: string,
        id: string,
        rules: unknown,
      ) => ({
        rules: await invoke(
          categoryRulesService.replaceCategoryRules,
          '7',
          id,
          rules,
        ),
        revision: '0',
      }),
    });
    Object.assign(transactionsService, {
      createManualTransactionInSpace: (
        _userId: string,
        _spaceId: string,
        input: unknown,
      ) => invoke(transactionsService.createManualTransaction, _userId, input),
      listTransactionsInSpace: (_spaceId: string, query: unknown) =>
        invoke(transactionsService.listTransactions, '7', query),
      getManualTransactionInSpace: (_spaceId: string, id: string) =>
        invoke(transactionsService.getManualTransaction, '7', id),
      updateTransactionInSpace: (
        _spaceId: string,
        id: string,
        input: unknown,
      ) => invoke(transactionsService.updateTransaction, '7', id, input),
      deleteManualTransactionInSpace: (_spaceId: string, id: string) =>
        invoke(transactionsService.deleteManualTransaction, '7', id),
    });
    Object.assign(statementImportsService, {
      getStatementImportInSpace: (_spaceId: string, id: string) =>
        invoke(statementImportsService.getStatementImport, '7', id),
      listStatementImportsInSpace: (_spaceId: string, query: unknown) =>
        invoke(statementImportsService.listStatementImports, '7', query),
      commitReviewedStatementImportInSpace: (
        _userId: string,
        _spaceId: string,
        input: unknown,
      ) =>
        invoke(
          statementImportsService.commitReviewedStatementImport,
          _userId,
          input,
        ),
    });

    const testingModule = Test.createTestingModule({
      imports: [OpenApiModule],
      providers: [
        { provide: CLERK_TOKEN_VERIFIER, useValue: verifier },
        { provide: USER_STORE, useValue: userStore },
        ClerkAuthenticationGuard,
        ProvisionedUserGuard,
      ],
    });
    testingModule
      .overrideProvider(DATABASE_READINESS)
      .useValue(readiness)
      .overrideProvider(CLERK_TOKEN_VERIFIER)
      .useValue(verifier)
      .overrideProvider(USER_STORE)
      .useValue(userStore)
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(CategoriesService)
      .useValue(categoriesService)
      .overrideProvider(BudgetsService)
      .useValue(budgetsService)
      .overrideProvider(CategorySummariesService)
      .useValue(categorySummariesService)
      .overrideProvider(CategoryRulesService)
      .useValue(categoryRulesService)
      .overrideProvider(TransactionsService)
      .useValue(transactionsService)
      .overrideProvider(StatementImportsService)
      .useValue(statementImportsService)
      .overrideProvider(SpaceAccessService)
      .useValue(spaceAccessService);
    const module = await testingModule.compile();

    app = module.createNestApplication();
    configureApp(app, testConfig);
    await app.init();
  });

  beforeEach(() => {
    resetMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates representative responses for every operation and success variant', async () => {
    usersService.provisionUser
      .mockResolvedValueOnce({ user: userRecord(), created: true })
      .mockResolvedValueOnce({ user: userRecord(), created: false });
    budgetsService.putBudget
      .mockResolvedValueOnce({ budget: budgetRecord(), created: true })
      .mockResolvedValueOnce({ budget: budgetRecord(), created: false });
    transactionsService.updateTransaction
      .mockResolvedValueOnce(manualTransactionRecord())
      .mockResolvedValueOnce(importedTransactionRecord());
    readiness.isReady.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const manualResponse = manualTransactionResponse();
    const importedResponse = importedTransactionResponse();
    const cases: RuntimeSuccessCase[] = [
      {
        name: 'ready health',
        method: 'get',
        path: '/health',
        contractPath: '/health',
        status: 200,
        expectedBody: { status: 'ok', database: 'ready' },
      },
      {
        name: 'unavailable health',
        method: 'get',
        path: '/health',
        contractPath: '/health',
        status: 503,
        expectedBody: { status: 'error', database: 'unavailable' },
      },
      {
        name: 'new User provisioning',
        method: 'put',
        path: '/api/v1/users/me',
        contractPath: '/api/v1/users/me',
        status: 201,
        expectedBody: userResponse(),
        location: '/api/v1/users/me',
      },
      {
        name: 'synchronized User provisioning',
        method: 'put',
        path: '/api/v1/users/me',
        contractPath: '/api/v1/users/me',
        status: 200,
        expectedBody: userResponse(),
      },
      {
        name: 'User profile',
        method: 'get',
        path: '/api/v1/users/me',
        contractPath: '/api/v1/users/me',
        status: 200,
        expectedBody: userResponse(),
      },
      {
        name: 'created Category',
        method: 'post',
        path: '/api/v1/users/me/categories',
        contractPath: '/api/v1/users/me/categories',
        status: 201,
        body: { name: 'Groceries' },
        expectedBody: categoryResponse(),
        location: '/api/v1/users/me/categories/42',
      },
      {
        name: 'Category collection',
        method: 'get',
        path: '/api/v1/users/me/categories',
        contractPath: '/api/v1/users/me/categories',
        status: 200,
        expectedBody: [categoryResponse()],
      },
      {
        name: 'Category item',
        method: 'get',
        path: '/api/v1/users/me/categories/42',
        contractPath: '/api/v1/users/me/categories/{categoryId}',
        status: 200,
        expectedBody: categoryResponse(),
      },
      {
        name: 'updated Category',
        method: 'patch',
        path: '/api/v1/users/me/categories/42',
        contractPath: '/api/v1/users/me/categories/{categoryId}',
        status: 200,
        body: { name: 'Dining' },
        expectedBody: categoryResponse(),
      },
      {
        name: 'new Budget',
        method: 'put',
        path: '/api/v1/users/me/categories/42/budget',
        contractPath: '/api/v1/users/me/categories/{categoryId}/budget',
        status: 201,
        body: { amount: '250.00', period: 'monthly' },
        expectedBody: budgetResponse(),
        location: '/api/v1/users/me/categories/42/budget',
      },
      {
        name: 'replaced Budget',
        method: 'put',
        path: '/api/v1/users/me/categories/42/budget',
        contractPath: '/api/v1/users/me/categories/{categoryId}/budget',
        status: 200,
        body: { amount: '250.00', period: 'monthly' },
        expectedBody: budgetResponse(),
      },
      {
        name: 'Budget item',
        method: 'get',
        path: '/api/v1/users/me/categories/42/budget',
        contractPath: '/api/v1/users/me/categories/{categoryId}/budget',
        status: 200,
        expectedBody: budgetResponse(),
      },
      {
        name: 'deleted Budget',
        method: 'delete',
        path: '/api/v1/users/me/categories/42/budget',
        contractPath: '/api/v1/users/me/categories/{categoryId}/budget',
        status: 204,
      },
      {
        name: 'monthly Category summary',
        method: 'get',
        path: '/api/v1/users/me/category-summaries',
        contractPath: '/api/v1/users/me/category-summaries',
        status: 200,
        query: { period: 'monthly', year: '2026', month: '08' },
        expectedBody: categorySummaryResponse(),
      },
      {
        name: 'created Category rule',
        method: 'post',
        path: '/api/v1/users/me/category-rules',
        contractPath: '/api/v1/users/me/category-rules',
        status: 201,
        body: { pattern: 'Green Market', categoryId: '42' },
        expectedBody: categoryRuleResponse(),
        location: '/api/v1/users/me/category-rules/45',
      },
      {
        name: 'Category rule collection',
        method: 'get',
        path: '/api/v1/users/me/category-rules',
        contractPath: '/api/v1/users/me/category-rules',
        status: 200,
        expectedBody: [categoryRuleResponse()],
      },
      {
        name: 'replaced Category rules with Contains',
        method: 'put',
        path: '/api/v1/users/me/categories/42/rules',
        contractPath: '/api/v1/users/me/categories/{categoryId}/rules',
        status: 200,
        body: { rules: [{ pattern: 'Green Market', matchType: 'contains' }] },
        expectedBody: [{ ...categoryRuleResponse(), matchType: 'contains' }],
      },
      {
        name: 'Category rule item',
        method: 'get',
        path: '/api/v1/users/me/category-rules/45',
        contractPath: '/api/v1/users/me/category-rules/{ruleId}',
        status: 200,
        expectedBody: categoryRuleResponse(),
      },
      {
        name: 'updated Category rule',
        method: 'patch',
        path: '/api/v1/users/me/category-rules/45',
        contractPath: '/api/v1/users/me/category-rules/{ruleId}',
        status: 200,
        body: { pattern: 'Green Market' },
        expectedBody: categoryRuleResponse(),
      },
      {
        name: 'deleted Category rule',
        method: 'delete',
        path: '/api/v1/users/me/category-rules/45',
        contractPath: '/api/v1/users/me/category-rules/{ruleId}',
        status: 204,
      },
      {
        name: 'created manual Transaction',
        method: 'post',
        path: '/api/v1/users/me/transactions',
        contractPath: '/api/v1/users/me/transactions',
        status: 201,
        body: {
          purchaseDate: '2026-08-01',
          description: 'Coffee',
          amount: '4.50',
        },
        expectedBody: manualResponse,
        location: '/api/v1/users/me/transactions/46',
      },
      {
        name: 'mixed Transaction history page',
        method: 'get',
        path: '/api/v1/users/me/transactions',
        contractPath: '/api/v1/users/me/transactions',
        status: 200,
        query: { pageSize: '2' },
        expectedBody: transactionHistoryPageResponse(),
      },
      {
        name: 'manual Transaction item',
        method: 'get',
        path: '/api/v1/users/me/transactions/46',
        contractPath: '/api/v1/users/me/transactions/{transactionId}',
        status: 200,
        expectedBody: manualResponse,
      },
      {
        name: 'manual Transaction update variant',
        method: 'patch',
        path: '/api/v1/users/me/transactions/46',
        contractPath: '/api/v1/users/me/transactions/{transactionId}',
        status: 200,
        body: { amount: '5.00' },
        expectedBody: manualResponse,
      },
      {
        name: 'imported Transaction update variant',
        method: 'patch',
        path: '/api/v1/users/me/transactions/47',
        contractPath: '/api/v1/users/me/transactions/{transactionId}',
        status: 200,
        body: { categoryId: '42' },
        expectedBody: importedResponse,
      },
      {
        name: 'deleted manual Transaction',
        method: 'delete',
        path: '/api/v1/users/me/transactions/46',
        contractPath: '/api/v1/users/me/transactions/{transactionId}',
        status: 204,
      },
      {
        name: 'Statement import item',
        method: 'get',
        path: '/api/v1/users/me/statement-imports/10',
        contractPath: '/api/v1/users/me/statement-imports/{statementImportId}',
        status: 200,
        expectedBody: statementImportResponse(),
      },
      {
        name: 'Statement import history page',
        method: 'get',
        path: '/api/v1/users/me/statement-imports',
        contractPath: '/api/v1/users/me/statement-imports',
        status: 200,
        query: { pageSize: '2' },
        expectedBody: statementImportHistoryPageResponse(),
      },
      {
        name: 'created Statement import',
        method: 'post',
        path: '/api/v1/users/me/statement-imports',
        contractPath: '/api/v1/users/me/statement-imports',
        status: 201,
        body: statementImportRequest(),
        expectedBody: statementImportResponse(),
        location: '/api/v1/users/me/spaces/9/statement-imports/10',
      },
    ];

    for (const testCase of cases) {
      const response = await sendRequest(testCase);
      expect(response.status).toBe(testCase.status);
      responseValidator.assertValid(
        testCase.contractPath,
        testCase.method,
        testCase.status,
        response.body,
        response.headers,
      );
      if (testCase.expectedBody !== undefined) {
        expect(response.body).toEqual(testCase.expectedBody);
        expect(response.headers['content-type']).toMatch(/^application\/json/);
      }
      if (testCase.location !== undefined) {
        expect(response.headers.location).toBe(testCase.location);
      }
      if (testCase.status === 204) {
        expect(response.headers['content-type']).toBeUndefined();
      }
    }
  });

  it('protects replacement and returns nested validation and structured duplicate details', async () => {
    const route = {
      method: 'put' as const,
      path: '/api/v1/users/me/categories/42/rules',
      contractPath: '/api/v1/users/me/categories/{categoryId}/rules',
    };
    await sendErrorRequest({
      ...route,
      body: { rules: [] },
      status: 401,
      code: 'UNAUTHENTICATED',
      authorization: null,
    });
    await sendErrorRequest({
      ...route,
      body: { rules: [] },
      status: 403,
      code: 'USER_NOT_PROVISIONED',
      authorization: 'Bearer unprovisioned-session-token',
    });
    await sendErrorRequest({
      ...route,
      body: { rules: [] },
      status: 406,
      code: 'NOT_ACCEPTABLE',
      accept: 'text/plain',
    });
    await sendErrorRequest({
      ...route,
      body: 'rules=[]',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      contentType: 'text/plain',
    });
    const invalid = await sendErrorRequest({
      ...route,
      body: { rules: [{ pattern: 'RENT' }] },
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(invalid.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: '/rules/0/matchType' }),
      ]),
    );
    await sendErrorRequest({
      ...route,
      body: { rules: [{ pattern: 'RENT', matchType: 'exact', id: '45' }] },
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(categoryRulesService.replaceCategoryRules).not.toHaveBeenCalled();
    categoryRulesService.replaceCategoryRules.mockRejectedValueOnce(
      new CategoryRulePatternConflictError('43', '/rules/0/pattern'),
    );
    const conflict = await sendErrorRequest({
      ...route,
      body: { rules: [{ pattern: 'RENT', matchType: 'contains' }] },
      status: 409,
      code: 'CATEGORY_RULE_PATTERN_ALREADY_EXISTS',
    });
    expect(conflict.body.error.details).toEqual([
      expect.objectContaining({ categoryId: '43', field: '/rules/0/pattern' }),
    ]);
    categoryRulesService.replaceCategoryRules.mockResolvedValueOnce([]);
    const cleared = await sendRequest({
      ...route,
      body: { rules: [] },
      status: 200,
    });
    expect(cleared.body).toEqual([]);
  });

  it('validates authentication, negotiation, parser, and application error families at their public HTTP seam', async () => {
    const unauthenticated = await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 401,
      code: 'UNAUTHENTICATED',
      authorization: null,
    });
    expect(unauthenticated.headers['www-authenticate']).toBe('Bearer');

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 403,
      code: 'USER_NOT_PROVISIONED',
      authorization: 'Bearer unprovisioned-session-token',
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 406,
      code: 'NOT_ACCEPTABLE',
      accept: 'text/plain',
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      contentType: 'text/plain',
      body: 'name=Groceries',
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 400,
      code: 'INVALID_JSON',
      contentType: 'application/json',
      rawBody: '{"name":',
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 413,
      code: 'HTTP_ERROR',
      contentType: 'application/json',
      rawBody: Buffer.alloc(MAX_REQUEST_BODY_SIZE + 1, 32),
    });

    categoriesService.createCategory.mockRejectedValueOnce(
      new ApplicationError(
        'VALIDATION_FAILED',
        'The request contains invalid fields.',
      ),
    );
    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: { name: 'Groceries' },
    });

    categoriesService.getCategory.mockRejectedValueOnce(
      new CategoryNotFoundError(),
    );
    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories/404',
      contractPath: '/api/v1/users/me/categories/{categoryId}',
      status: 404,
      code: 'CATEGORY_NOT_FOUND',
    });

    categoriesService.createCategory.mockRejectedValueOnce(
      new CategoryNameConflictError(),
    );
    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 409,
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
      body: { name: 'Groceries' },
    });

    usersService.provisionUser.mockRejectedValueOnce(
      new ClerkProfileUnavailableError(),
    );
    await sendErrorRequest({
      method: 'put',
      path: '/api/v1/users/me',
      contractPath: '/api/v1/users/me',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });

    categoriesService.listCategories.mockRejectedValueOnce(
      new Error('database details must not escape'),
    );
    const internal = await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(internal.body)).not.toContain('database details');

    statementImportsService.commitReviewedStatementImport.mockRejectedValueOnce(
      new StatementImportProbableDuplicatesError([
        {
          fingerprint: 'internal-fingerprint',
          incomingTransactionIndexes: [0, 2],
          committedMatches: [{ id: '18' }],
        },
      ]),
    );
    const probableDuplicate = await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/statement-imports',
      contractPath: '/api/v1/users/me/statement-imports',
      status: 409,
      code: 'STATEMENT_IMPORT_PROBABLE_DUPLICATES',
      body: statementImportRequest(),
    });
    expect(probableDuplicate.body).toMatchObject({
      error: {
        details: [
          {
            field: '/transactions/0',
            code: 'probable_duplicate',
            transactionIndexes: [0, 2],
            committedTransactionIds: ['18'],
          },
        ],
      },
    });
    expect(JSON.stringify(probableDuplicate.body)).not.toContain(
      'internal-fingerprint',
    );
  });

  it('enforces generated request constraints at runtime', async () => {
    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: { name: '   ' },
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: { name: 'x'.repeat(101) },
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/categories',
      contractPath: '/api/v1/users/me/categories',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: { name: 'Groceries', userId: '8' },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/categories/0',
      contractPath: '/api/v1/users/me/categories/{categoryId}',
      status: 400,
      code: 'VALIDATION_FAILED',
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/transactions',
      contractPath: '/api/v1/users/me/transactions',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { fromDate: '2026-02-30' },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/transactions',
      contractPath: '/api/v1/users/me/transactions',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { userId: '8' },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/transactions',
      contractPath: '/api/v1/users/me/transactions',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { pageSize: '101' },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/transactions',
      contractPath: '/api/v1/users/me/transactions',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { fromDate: '2026-09-01', toDate: '2026-08-01' },
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/transactions',
      contractPath: '/api/v1/users/me/transactions',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: {
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '0.00',
      },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/category-summaries',
      contractPath: '/api/v1/users/me/category-summaries',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { period: 'monthly', year: '2026' },
    });

    await sendErrorRequest({
      method: 'get',
      path: '/api/v1/users/me/category-summaries',
      contractPath: '/api/v1/users/me/category-summaries',
      status: 400,
      code: 'VALIDATION_FAILED',
      query: { period: 'yearly', year: '2026', month: '08' },
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/statement-imports',
      contractPath: '/api/v1/users/me/statement-imports',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: {
        ...statementImportRequest(),
        fileHash: 'not-a-sha256-digest',
      },
    });

    await sendErrorRequest({
      method: 'post',
      path: '/api/v1/users/me/statement-imports',
      contractPath: '/api/v1/users/me/statement-imports',
      status: 400,
      code: 'VALIDATION_FAILED',
      body: {
        ...statementImportRequest(),
        transactions: [
          {
            purchaseDate: '2026-08-01',
            description: '',
            amount: '4.50',
          },
        ],
      },
    });
  });

  async function sendRequest(testCase: RuntimeSuccessCase) {
    let test = authenticatedRequest(testCase.method, testCase.path);
    if (testCase.query !== undefined) {
      test = test.query(testCase.query);
    }
    if (testCase.body !== undefined) {
      test = test.send(testCase.body);
    }
    return test;
  }

  async function sendErrorRequest(options: ErrorRequest): Promise<{
    status: number;
    body: Record<string, unknown>;
    headers: Record<string, string | undefined>;
  }> {
    let test = buildRequest(app, options.method, options.path);
    test.set('Accept', options.accept ?? 'application/json');
    const authorization =
      options.authorization === undefined
        ? 'Bearer valid-session-token'
        : options.authorization;
    if (authorization !== null) {
      test.set('Authorization', authorization);
    }
    if (options.query !== undefined) {
      test = test.query(options.query);
    }
    if (options.rawBody !== undefined) {
      test = test.send(options.rawBody);
    } else if (options.body !== undefined) {
      test = test.send(options.body);
    }
    if (options.contentType !== undefined) {
      test.set('Content-Type', options.contentType);
    }

    const response = await test;
    expect(response.status).toBe(options.status);
    responseValidator.assertValid(
      options.contractPath,
      options.method,
      options.status,
      response.body,
      response.headers,
    );
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toMatchObject({ error: { code: options.code } });
    return response;
  }

  function authenticatedRequest(method: HttpMethod, path: string) {
    const test = buildRequest(app, method, path);
    test.set('Authorization', 'Bearer valid-session-token');
    test.set('Accept', 'application/json');
    return test;
  }

  function resetMocks(): void {
    verifier.reset();
    readiness.isReady.mockReset().mockResolvedValue(true);
    userStore.findByClerkUserId
      .mockReset()
      .mockImplementation((clerkUserId: string) =>
        Promise.resolve(
          clerkUserId === 'user_unprovisioned' ? null : userRecord(),
        ),
      );
    usersService.provisionUser
      .mockReset()
      .mockResolvedValue({ user: userRecord(), created: false });
    usersService.getUserById.mockReset().mockResolvedValue(userRecord());
    categoriesService.createCategory
      .mockReset()
      .mockResolvedValue(categoryRecord());
    categoriesService.listCategories
      .mockReset()
      .mockResolvedValue([categoryRecord()]);
    categoriesService.getCategory
      .mockReset()
      .mockResolvedValue(categoryRecord());
    categoriesService.updateCategory
      .mockReset()
      .mockResolvedValue(categoryRecord());
    budgetsService.putBudget
      .mockReset()
      .mockResolvedValue({ budget: budgetRecord(), created: false });
    budgetsService.getBudget.mockReset().mockResolvedValue(budgetRecord());
    budgetsService.deleteBudget.mockReset().mockResolvedValue(undefined);
    categorySummariesService.getCategorySummary
      .mockReset()
      .mockResolvedValue(categorySummaryResult());
    categoryRulesService.createCategoryRule
      .mockReset()
      .mockResolvedValue(categoryRuleRecord());
    categoryRulesService.replaceCategoryRules
      .mockReset()
      .mockResolvedValue([categoryRuleRecord({ matchType: 'contains' })]);
    categoryRulesService.listCategoryRules
      .mockReset()
      .mockResolvedValue([categoryRuleRecord()]);
    categoryRulesService.getCategoryRule
      .mockReset()
      .mockResolvedValue(categoryRuleRecord());
    categoryRulesService.updateCategoryRule
      .mockReset()
      .mockResolvedValue(categoryRuleRecord());
    categoryRulesService.deleteCategoryRule
      .mockReset()
      .mockResolvedValue(undefined);
    transactionsService.createManualTransaction
      .mockReset()
      .mockResolvedValue(manualTransactionRecord());
    transactionsService.listTransactions.mockReset().mockResolvedValue({
      items: [manualTransactionRecord(), importedTransactionRecord()],
      nextCursor: 'cursor_1',
    });
    transactionsService.getManualTransaction
      .mockReset()
      .mockResolvedValue(manualTransactionRecord());
    transactionsService.updateTransaction
      .mockReset()
      .mockResolvedValue(manualTransactionRecord());
    transactionsService.deleteManualTransaction
      .mockReset()
      .mockResolvedValue(undefined);
    statementImportsService.getStatementImport
      .mockReset()
      .mockResolvedValue(statementImportRecord());
    statementImportsService.listStatementImports.mockReset().mockResolvedValue({
      items: [statementImportHistoryRecord()],
      nextCursor: null,
    });
    statementImportsService.commitReviewedStatementImport
      .mockReset()
      .mockResolvedValue(statementImportRecord());
    spaceAccessService.requirePersonalSpace
      .mockReset()
      .mockResolvedValue({ id: '9' });
    spaceAccessService.requirePersonalWriteSpace
      .mockReset()
      .mockResolvedValue({ id: '9' });
  }
});

interface RuntimeSuccessCase {
  name: string;
  method: HttpMethod;
  path: string;
  contractPath: string;
  status: number;
  body?: Record<string, unknown> | string;
  query?: Record<string, string | number>;
  expectedBody?: unknown;
  location?: string;
}

interface ErrorRequest {
  method: HttpMethod;
  path: string;
  contractPath: string;
  status: number;
  code: string;
  authorization?: string | null;
  accept?: string;
  contentType?: string;
  body?: Record<string, unknown> | string;
  rawBody?: string | Buffer;
  query?: Record<string, string | number>;
}

class FakeTokenVerifier implements ClerkTokenVerifier {
  private readonly verifyMock: jest.MockedFunction<
    ClerkTokenVerifier['verify']
  > = jest.fn();

  verify(token: string): Promise<ClerkSession> {
    return this.verifyMock(token);
  }

  reset(): void {
    this.verifyMock.mockReset().mockImplementation((token: string) => {
      if (token === 'valid-session-token') {
        return Promise.resolve({
          userId: 'user_42',
          sessionId: 'session_42',
          claims: { sub: 'user_42', sid: 'session_42' },
        });
      }
      if (token === 'unprovisioned-session-token') {
        return Promise.resolve({
          userId: 'user_unprovisioned',
          sessionId: 'session_unprovisioned',
          claims: { sub: 'user_unprovisioned', sid: 'session_unprovisioned' },
        });
      }
      return Promise.reject(new Error('invalid token'));
    });
  }
}

class OpenApiResponseValidator {
  private readonly ajv = new Ajv({ allErrors: true, jsonPointers: true });
  private sequence = 0;

  constructor(private readonly document: OpenAPIObject) {
    this.ajv.addFormat('date', (value: string) => isValidDomainDate(value));
    this.ajv.addFormat(
      'date-time',
      (value: string) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
        !Number.isNaN(Date.parse(value)),
    );
    this.ajv.addFormat('email', (value: string) => isEmail(value));
  }

  assertValid(
    path: string,
    method: HttpMethod,
    status: number,
    body: unknown,
    headers: Record<string, string | undefined>,
  ): void {
    const operation = this.document.paths[path]?.[method];
    if (!operation) {
      throw new Error(
        `Missing contract operation ${method.toUpperCase()} ${path}`,
      );
    }
    const responseValue = operation.responses[String(status)];
    if (!responseValue) {
      throw new Error(`Missing contract response ${status} for ${path}`);
    }
    const response = resolveResponse(this.document, responseValue);
    this.assertResponseHeaders(response, headers, path, method, status);
    if (status === 204) {
      return;
    }
    const schema = response.content?.['application/json']?.schema;
    if (!schema) {
      throw new Error(`Response ${status} for ${path} has no JSON schema`);
    }

    this.assertSchema(
      schema,
      body,
      `Response ${status} for ${method.toUpperCase()} ${path}`,
    );
  }

  private assertResponseHeaders(
    response: ResponseObject,
    actualHeaders: Record<string, string | undefined>,
    path: string,
    method: HttpMethod,
    status: number,
  ): void {
    for (const [name, headerValue] of Object.entries(response.headers ?? {})) {
      if ('$ref' in headerValue) {
        throw new Error(`Unresolved header reference for ${name}`);
      }
      const actualValue = Object.entries(actualHeaders).find(
        ([actualName]) => actualName.toLowerCase() === name.toLowerCase(),
      )?.[1];
      if (actualValue === undefined) {
        if (headerValue.required) {
          throw new Error(
            `Missing required ${name} header for ${method.toUpperCase()} ${path} ${status}`,
          );
        }
        continue;
      }
      if (headerValue.schema !== undefined) {
        this.assertSchema(
          headerValue.schema,
          actualValue,
          `Header ${name} for ${method.toUpperCase()} ${path} ${status}`,
        );
      }
    }
  }

  private assertSchema(schema: unknown, value: unknown, label: string): void {
    const definitions = Object.fromEntries(
      Object.entries(this.document.components?.schemas ?? {}).map(
        ([name, value]) => [name, rewriteSchema(value)],
      ),
    );
    const rootSchema = {
      $id: `openapi-response-${this.sequence++}`,
      definitions,
      allOf: [rewriteSchema(schema)],
    };
    const validate = this.ajv.compile(rootSchema);
    if (!validate(value)) {
      throw new Error(
        `${label} failed schema validation: ${JSON.stringify(validate.errors)}`,
      );
    }
  }
}

function buildRequest(
  application: INestApplication,
  method: HttpMethod,
  path: string,
) {
  switch (method) {
    case 'get':
      return request(httpServer(application)).get(path);
    case 'post':
      return request(httpServer(application)).post(path);
    case 'put':
      return request(httpServer(application)).put(path);
    case 'patch':
      return request(httpServer(application)).patch(path);
    case 'delete':
      return request(httpServer(application)).delete(path);
  }
}

function resolveResponse(
  document: OpenAPIObject,
  response: ResponseObject | ReferenceObject,
): ResponseObject {
  if (!('$ref' in response)) {
    return response;
  }
  const responseName = response.$ref.split('/').at(-1);
  const resolved = responseName
    ? document.components?.responses?.[responseName]
    : undefined;
  if (!resolved || '$ref' in resolved) {
    throw new Error(`Unable to resolve response ${response.$ref}`);
  }
  return resolved;
}

function rewriteSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteSchema);
  }
  if (!isRecord(value)) {
    return value;
  }

  const normalized: JsonSchema = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'nullable' || key === 'discriminator') {
      continue;
    }
    if (key === '$ref' && typeof child === 'string') {
      normalized[key] = child.replace(
        '#/components/schemas/',
        '#/definitions/',
      );
      continue;
    }
    normalized[key] = rewriteSchema(child);
  }

  return value.nullable === true
    ? { anyOf: [normalized, { type: 'null' }] }
    : normalized;
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null;
}

function httpServer(application: INestApplication): Server {
  return application.getHttpServer() as Server;
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  corsOrigins: [],
  clerkJwtKey: undefined,
  clerkSecretKey: undefined,
  clerkAuthorizedParties: [],
};

const CREATED_AT = '2026-08-29T00:00:00.000Z';
const UPDATED_AT = '2026-08-30T00:00:00.000Z';

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: '42',
    clerkUserId: 'user_42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function userResponse(): Record<string, unknown> {
  return {
    id: '42',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function categoryRecord(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  return {
    id: '42',
    userId: '42',
    name: 'Groceries',
    description: null,
    isActive: true,
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function categoryResponse(): Record<string, unknown> {
  return {
    id: '42',
    name: 'Groceries',
    description: null,
    color: 'plum',
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function budgetRecord(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: '44',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly',
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function budgetResponse(): Record<string, unknown> {
  return {
    id: '44',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function categorySummaryResult(): CategorySummaryResult {
  return {
    period: 'monthly',
    year: '2026',
    month: '08',
    categories: [
      {
        categoryId: '42',
        name: 'Groceries',
        isActive: true,
        totalAmount: '125.00',
        transactionCount: '2',
        budgetAmount: null,
        remainingAmount: null,
      },
    ],
    uncategorizedTotal: '4.50',
    uncategorizedCount: '1',
  };
}

function categorySummaryResponse(): Record<string, unknown> {
  return { ...categorySummaryResult() };
}

function categoryRuleRecord(
  overrides: Partial<CategoryRuleRecord> = {},
): CategoryRuleRecord {
  return {
    id: '45',
    userId: '42',
    categoryId: '42',
    pattern: 'Green Market',
    normalizedPattern: 'green market',
    matchType: 'exact',
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function categoryRuleResponse(): Record<string, unknown> {
  return {
    id: '45',
    categoryId: '42',
    pattern: 'Green Market',
    matchType: 'exact',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function manualTransactionRecord(
  overrides: Partial<ManualTransactionRecord> = {},
): ManualTransactionRecord {
  return {
    id: '46',
    userId: '42',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function importedTransactionRecord(
  overrides: Partial<ImportedTransactionRecord> = {},
): ImportedTransactionRecord {
  return {
    id: '47',
    userId: '42',
    categoryId: null,
    statementImportId: '10',
    purchaseDate: '2026-08-02',
    description: 'Imported Coffee',
    amount: '6.25',
    categoryMatchConfidence: null,
    importFingerprint: 'internal-fingerprint',
    source: 'imported',
    createdAt: new Date(CREATED_AT),
    updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function manualTransactionResponse(): Record<string, unknown> {
  return {
    id: '46',
    categoryId: '42',
    purchaseDate: '2026-08-01',
    description: 'Coffee',
    amount: '4.50',
    source: 'manual',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function importedTransactionResponse(): Record<string, unknown> {
  return {
    id: '47',
    categoryId: null,
    purchaseDate: '2026-08-02',
    description: 'Imported Coffee',
    amount: '6.25',
    source: 'imported',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function transactionHistoryPageResponse(): Record<string, unknown> {
  return {
    items: [
      {
        ...manualTransactionResponse(),
        statementImportId: null,
      },
      {
        ...importedTransactionResponse(),
        statementImportId: '10',
      },
    ],
    nextCursor: 'cursor_1',
  };
}

function statementImportRecord(
  overrides: Partial<StatementImportRecord> = {},
): StatementImportRecord {
  return {
    id: '10',
    userId: '42',
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: null,
    importedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function statementImportHistoryRecord(
  overrides: Partial<StatementImportHistoryRecord> = {},
): StatementImportHistoryRecord {
  return {
    ...statementImportRecord(),
    transactionCount: '2',
    ...overrides,
  };
}

function statementImportResponse(): Record<string, unknown> {
  return {
    id: '10',
    fileName: 'august.pdf',
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    cardType: null,
    importedAt: UPDATED_AT,
  };
}

function statementImportHistoryPageResponse(): Record<string, unknown> {
  return {
    items: [
      {
        ...statementImportResponse(),
        transactionCount: '2',
      },
    ],
    nextCursor: null,
  };
}

function statementImportRequest(): Record<string, unknown> {
  return {
    fileName: 'august.pdf',
    fileHash: 'a'.repeat(64),
    statementDate: '2026-08-31',
    bank: 'Example Bank',
    transactions: [
      {
        purchaseDate: '2026-08-01',
        description: 'Coffee',
        amount: '4.50',
      },
    ],
  };
}
