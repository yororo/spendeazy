import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { load } from 'js-yaml';
import { RequestMethod } from '@nestjs/common';
import {
  PATH_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
} from '@nestjs/swagger';
import { API_PREFIX } from '../config/app-config';
import { CATEGORY_COLORS } from '../categories/application/category-color';
import {
  generateOpenApiArtifacts,
  OPENAPI_ARTIFACT_DIRECTORY,
  OPENAPI_JSON_FILENAME,
  OPENAPI_YAML_FILENAME,
} from './generate-openapi';
import { createOpenApiDocument } from './openapi-document.factory';
import { OpenApiModule } from './openapi.module';
import { createApiFeatureModules } from '../api-feature-modules';
import { DATABASE_READINESS } from '../health/database-readiness';
import { HealthModule } from '../health/health.module';
import { HEALTH_PATH } from '../http/public-route-paths';

type SwaggerParserDocument = Parameters<typeof SwaggerParser.validate>[0];
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface SuccessResponseContract {
  status: string;
  schemaRef?: string;
  arrayItemSchemaRef?: string;
  unionSchemaRefs?: readonly string[];
  location?: string;
}

interface OperationExpectation {
  operationId: string;
  tag: string;
  requestSchemaRef?: string;
  pathParameter?: string;
  pathParameters?: readonly string[];
  headerParameters?: readonly string[];
  requiredHeaderParameters?: readonly string[];
  queryParameters?: readonly string[];
  requiredQueryParameters?: readonly string[];
  queryParameterSchemas?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  bodyResponses: readonly SuccessResponseContract[];
  errorResponses: Readonly<Record<string, string>>;
  public?: boolean;
  explicitBearerAuth?: boolean;
}

const PROTECTED_ERRORS = {
  '401': 'UnauthenticatedError',
  '403': 'UserNotProvisionedError',
  '406': 'NotAcceptableError',
  '500': 'InternalError',
} as const;

const VALIDATED_PATH_ERRORS = {
  '400': 'ValidationError',
  '404': 'NotFoundError',
} as const;

const VALIDATION_ERROR = { '400': 'ValidationError' } as const;

const JSON_BODY_ERRORS = {
  '400': 'ValidationError',
  '413': 'HttpError',
  '415': 'UnsupportedMediaTypeError',
} as const;

const PROVISIONING_ERRORS = {
  '401': 'UnauthenticatedError',
  '406': 'NotAcceptableError',
  '500': 'InternalError',
} as const;

const DATE_QUERY_SCHEMA = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

const PAGINATION_QUERY_SCHEMAS = {
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  cursor: {
    type: 'string',
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
  },
} as const;

const TRANSACTION_QUERY_SCHEMAS = {
  fromDate: DATE_QUERY_SCHEMA,
  toDate: DATE_QUERY_SCHEMA,
  categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
  categoryState: {
    type: 'string',
    enum: ['categorized', 'uncategorized'],
  },
  statementImportId: { type: 'string', pattern: '^[1-9]\\d*$' },
  source: { type: 'string', enum: ['manual', 'imported'] },
  ...PAGINATION_QUERY_SCHEMAS,
} as const;

// This independent test oracle specifies public behavior expectations only; it
// is never consumed by document generation or runtime routing.
const OPERATION_EXPECTATIONS = [
  {
    operationId: 'Health_getHealth',
    tag: 'Health',
    bodyResponses: [
      { status: '200', schemaRef: 'HealthResponseDto' },
      { status: '503', schemaRef: 'HealthResponseDto' },
    ],
    errorResponses: {},
    public: true,
  },
  {
    operationId: 'Users_provisionUser',
    tag: 'Users',
    bodyResponses: [
      { status: '200', schemaRef: 'UserResponseDto' },
      {
        status: '201',
        schemaRef: 'UserResponseDto',
        location: `/${API_PREFIX}/users/me`,
      },
    ],
    errorResponses: {
      ...PROVISIONING_ERRORS,
      '400': 'ValidationError',
      '404': 'NotFoundError',
      '409': 'ConflictError',
      '503': 'ServiceUnavailableError',
    },
  },
  {
    operationId: 'Users_getUser',
    tag: 'Users',
    bodyResponses: [{ status: '200', schemaRef: 'UserResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, '404': 'NotFoundError' },
  },
  {
    operationId: 'Users_deleteUser',
    tag: 'Users',
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '500': 'InternalError',
    },
  },
  {
    operationId: 'Spaces_listSpaces',
    tag: 'Spaces',
    bodyResponses: [{ status: '200', arrayItemSchemaRef: 'SpaceResponseDto' }],
    errorResponses: PROTECTED_ERRORS,
  },
  {
    operationId: 'Spaces_getSpace',
    tag: 'Spaces',
    pathParameter: 'spaceId',
    bodyResponses: [{ status: '200', schemaRef: 'SpaceResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'Spaces_leaveSpace',
    tag: 'Spaces',
    requestSchemaRef: 'ConfirmSpaceLeaveDto',
    pathParameter: 'spaceId',
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
    },
  },
  {
    operationId: 'Invitations_list',
    tag: 'Invitations',
    explicitBearerAuth: true,
    bodyResponses: [{ status: '200', schemaRef: 'InvitationInboxResponseDto' }],
    errorResponses: PROTECTED_ERRORS,
  },
  {
    operationId: 'Invitations_create',
    tag: 'Invitations',
    explicitBearerAuth: true,
    requestSchemaRef: 'CreateInvitationDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'OutgoingInvitationResponseDto',
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Invitations_claim',
    tag: 'Invitations',
    explicitBearerAuth: true,
    requestSchemaRef: 'ClaimInvitationDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'IncomingInvitationResponseDto',
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      '400': 'ValidationError',
      '404': 'NotFoundError',
      '413': 'HttpError',
      '415': 'UnsupportedMediaTypeError',
      '429': 'RateLimitError',
    },
  },
  {
    operationId: 'Invitations_decline',
    tag: 'Invitations',
    explicitBearerAuth: true,
    pathParameter: 'claimId',
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
    },
  },
  {
    operationId: 'SpaceNotifications_listNotifications',
    tag: 'Notifications',
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'SpaceNotificationResponseDto' },
    ],
    errorResponses: {
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '500': 'InternalError',
    },
  },
  {
    operationId: 'SpaceNotifications_retryNotification',
    tag: 'Notifications',
    pathParameter: 'notificationId',
    bodyResponses: [
      { status: '200', schemaRef: 'SpaceNotificationResponseDto' },
    ],
    errorResponses: {
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '500': 'InternalError',
    },
  },
  {
    operationId: 'SpaceNotifications_markNotificationRead',
    tag: 'Notifications',
    pathParameter: 'notificationId',
    bodyResponses: [
      { status: '200', schemaRef: 'SpaceNotificationResponseDto' },
    ],
    errorResponses: {
      '401': 'UnauthenticatedError',
      '403': 'UserNotProvisionedError',
      '404': 'NotFoundError',
      '500': 'InternalError',
    },
  },
  {
    operationId: 'Categories_createCategory',
    tag: 'Categories',
    requestSchemaRef: 'CreateCategoryDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'CategoryResponseDto',
        location: `/${API_PREFIX}/users/me/categories/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Categories_listCategories',
    tag: 'Categories',
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'CategoryResponseDto' },
    ],
    errorResponses: PROTECTED_ERRORS,
  },
  {
    operationId: 'Categories_getCategory',
    tag: 'Categories',
    pathParameter: 'categoryId',
    bodyResponses: [{ status: '200', schemaRef: 'CategoryResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'Categories_updateCategory',
    tag: 'Categories',
    requestSchemaRef: 'UpdateCategoryDto',
    pathParameter: 'categoryId',
    bodyResponses: [{ status: '200', schemaRef: 'CategoryResponseDto' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Budgets_putBudget',
    tag: 'Budgets',
    requestSchemaRef: 'UpsertBudgetDto',
    pathParameter: 'categoryId',
    bodyResponses: [
      { status: '200', schemaRef: 'BudgetResponseDto' },
      {
        status: '201',
        schemaRef: 'BudgetResponseDto',
        location: `/${API_PREFIX}/users/me/categories/42/budget`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Budgets_getBudget',
    tag: 'Budgets',
    pathParameter: 'categoryId',
    bodyResponses: [{ status: '200', schemaRef: 'BudgetResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'Budgets_deleteBudget',
    tag: 'Budgets',
    pathParameter: 'categoryId',
    headerParameters: ['if-match'],
    requiredHeaderParameters: ['if-match'],
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
    },
  },
  {
    operationId: 'CategorySummaries_getCategorySummary',
    tag: 'Category summaries',
    queryParameters: ['period', 'year', 'month'],
    requiredQueryParameters: ['period', 'year'],
    queryParameterSchemas: {
      period: { type: 'string', enum: ['monthly', 'yearly'] },
      year: { type: 'string', pattern: '^\\d{4}$' },
      month: { type: 'string', pattern: '^(0[1-9]|1[0-2])$' },
    },
    bodyResponses: [{ status: '200', schemaRef: 'CategorySummaryResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATION_ERROR },
  },
  {
    operationId: 'CategoryRules_createCategoryRule',
    tag: 'Category rules',
    requestSchemaRef: 'CreateCategoryRuleDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'CategoryRuleResponseDto',
        location: `/${API_PREFIX}/users/me/category-rules/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'CategoryRuleReplacement_replaceCategoryRules',
    tag: 'Category rules',
    requestSchemaRef: 'ReplaceCategoryRulesDto',
    pathParameter: 'categoryId',
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'CategoryRuleResponseDto' },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      ...JSON_BODY_ERRORS,
      '409': 'ConflictError',
    },
  },
  {
    operationId: 'CategoryRules_listCategoryRules',
    tag: 'Category rules',
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'CategoryRuleResponseDto' },
    ],
    errorResponses: PROTECTED_ERRORS,
  },
  {
    operationId: 'CategoryRules_getCategoryRule',
    tag: 'Category rules',
    pathParameter: 'ruleId',
    bodyResponses: [{ status: '200', schemaRef: 'CategoryRuleResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'CategoryRules_updateCategoryRule',
    tag: 'Category rules',
    requestSchemaRef: 'UpdateCategoryRuleDto',
    pathParameter: 'ruleId',
    bodyResponses: [{ status: '200', schemaRef: 'CategoryRuleResponseDto' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'CategoryRules_deleteCategoryRule',
    tag: 'Category rules',
    pathParameter: 'ruleId',
    headerParameters: ['if-match'],
    bodyResponses: [{ status: '204' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceCategoryRules_createCategoryRule',
    tag: 'Category rules',
    requestSchemaRef: 'CreateCategoryRuleDto',
    pathParameters: ['spaceId'],
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'CategoryRuleResponseDto',
        location: `/${API_PREFIX}/users/me/spaces/7/category-rules/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'SpaceCategoryRules_listCategoryRules',
    tag: 'Category rules',
    pathParameters: ['spaceId'],
    bodyResponses: [
      { status: '200', schemaRef: 'CategoryRuleCollectionResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, '404': 'NotFoundError' },
  },
  {
    operationId: 'SpaceCategoryRules_getCategoryRule',
    tag: 'Category rules',
    pathParameters: ['spaceId', 'ruleId'],
    bodyResponses: [{ status: '200', schemaRef: 'CategoryRuleResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceCategoryRules_updateCategoryRule',
    tag: 'Category rules',
    requestSchemaRef: 'UpdateCategoryRuleDto',
    pathParameters: ['spaceId', 'ruleId'],
    bodyResponses: [{ status: '200', schemaRef: 'CategoryRuleResponseDto' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'SpaceCategoryRules_deleteCategoryRule',
    tag: 'Category rules',
    pathParameters: ['spaceId', 'ruleId'],
    headerParameters: ['if-match'],
    bodyResponses: [{ status: '204' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceCategoryRuleReplacement_replaceCategoryRules',
    tag: 'Category rules',
    requestSchemaRef: 'SpaceReplaceCategoryRulesDto',
    pathParameters: ['spaceId', 'categoryId'],
    bodyResponses: [
      { status: '200', schemaRef: 'CategoryRuleCollectionResponseDto' },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      ...JSON_BODY_ERRORS,
      '409': 'ConflictError',
    },
  },
  {
    operationId: 'Transactions_createManualTransaction',
    tag: 'Transactions',
    requestSchemaRef: 'CreateManualTransactionDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'ManualTransactionResponseDto',
        location: `/${API_PREFIX}/users/me/transactions/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Transactions_listTransactions',
    tag: 'Transactions',
    queryParameters: [
      'fromDate',
      'toDate',
      'categoryId',
      'categoryState',
      'statementImportId',
      'source',
      'pageSize',
      'cursor',
    ],
    queryParameterSchemas: TRANSACTION_QUERY_SCHEMAS,
    bodyResponses: [
      { status: '200', schemaRef: 'TransactionHistoryPageResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATION_ERROR },
  },
  {
    operationId: 'Transactions_listDeletedTransactions',
    tag: 'Transactions',
    queryParameters: [
      'fromDate',
      'toDate',
      'categoryId',
      'categoryState',
      'statementImportId',
      'source',
      'pageSize',
      'cursor',
    ],
    queryParameterSchemas: TRANSACTION_QUERY_SCHEMAS,
    bodyResponses: [
      { status: '200', schemaRef: 'TransactionHistoryPageResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATION_ERROR },
  },
  {
    operationId: 'Transactions_getManualTransaction',
    tag: 'Transactions',
    pathParameter: 'transactionId',
    bodyResponses: [
      { status: '200', schemaRef: 'ManualTransactionResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'Transactions_listTransactionActivity',
    tag: 'Transactions',
    pathParameter: 'transactionId',
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'TransactionActivityResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'Transactions_updateTransaction',
    tag: 'Transactions',
    requestSchemaRef: 'UpdateManualTransactionDto',
    pathParameter: 'transactionId',
    bodyResponses: [
      {
        status: '200',
        unionSchemaRefs: [
          'ManualTransactionResponseDto',
          'ImportedTransactionResponseDto',
        ],
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'Transactions_deleteManualTransaction',
    tag: 'Transactions',
    pathParameter: 'transactionId',
    headerParameters: ['if-match'],
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
    },
  },
  {
    operationId: 'SpaceTransactions_createTransaction',
    tag: 'Transactions',
    requestSchemaRef: 'CreateManualTransactionDto',
    pathParameters: ['spaceId'],
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'ManualTransactionResponseDto',
        location: `/${API_PREFIX}/users/me/spaces/7/transactions/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'SpaceTransactions_listTransactions',
    tag: 'Transactions',
    pathParameters: ['spaceId'],
    queryParameters: [
      'fromDate',
      'toDate',
      'categoryId',
      'categoryState',
      'statementImportId',
      'source',
      'pageSize',
      'cursor',
    ],
    queryParameterSchemas: TRANSACTION_QUERY_SCHEMAS,
    bodyResponses: [
      { status: '200', schemaRef: 'TransactionHistoryPageResponseDto' },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
    },
  },
  {
    operationId: 'SpaceTransactions_listDeletedTransactions',
    tag: 'Transactions',
    pathParameters: ['spaceId'],
    queryParameters: [
      'fromDate',
      'toDate',
      'categoryId',
      'categoryState',
      'statementImportId',
      'source',
      'pageSize',
      'cursor',
    ],
    queryParameterSchemas: TRANSACTION_QUERY_SCHEMAS,
    bodyResponses: [
      { status: '200', schemaRef: 'TransactionHistoryPageResponseDto' },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
    },
  },
  {
    operationId: 'SpaceTransactions_getTransaction',
    tag: 'Transactions',
    pathParameters: ['spaceId', 'transactionId'],
    bodyResponses: [
      { status: '200', schemaRef: 'ManualTransactionResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceTransactions_listTransactionActivity',
    tag: 'Transactions',
    pathParameters: ['spaceId', 'transactionId'],
    bodyResponses: [
      { status: '200', arrayItemSchemaRef: 'TransactionActivityResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceTransactions_updateTransaction',
    tag: 'Transactions',
    requestSchemaRef: 'UpdateSpaceTransactionDto',
    pathParameters: ['spaceId', 'transactionId'],
    bodyResponses: [
      {
        status: '200',
        unionSchemaRefs: [
          'ManualTransactionResponseDto',
          'ImportedTransactionResponseDto',
        ],
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'SpaceTransactions_deleteTransaction',
    tag: 'Transactions',
    pathParameters: ['spaceId', 'transactionId'],
    headerParameters: ['if-match'],
    requiredHeaderParameters: ['if-match'],
    bodyResponses: [{ status: '204' }],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ConflictError',
    },
  },
  {
    operationId: 'StatementImports_getStatementImport',
    tag: 'Statement imports',
    pathParameter: 'statementImportId',
    bodyResponses: [{ status: '200', schemaRef: 'StatementImportResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'StatementImports_listStatementImports',
    tag: 'Statement imports',
    queryParameters: ['fromDate', 'toDate', 'pageSize', 'cursor'],
    queryParameterSchemas: {
      fromDate: DATE_QUERY_SCHEMA,
      toDate: DATE_QUERY_SCHEMA,
      ...PAGINATION_QUERY_SCHEMAS,
    },
    bodyResponses: [
      { status: '200', schemaRef: 'StatementImportHistoryPageResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATION_ERROR },
  },
  {
    operationId: 'StatementImports_commitReviewedStatementImport',
    tag: 'Statement imports',
    requestSchemaRef: 'CommitReviewedStatementImportDto',
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'StatementImportResponseDto',
        location: `/${API_PREFIX}/users/me/spaces/7/statement-imports/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ProbableDuplicateConflict',
      ...JSON_BODY_ERRORS,
    },
  },
  {
    operationId: 'SpaceStatementImports_getStatementImport',
    tag: 'Statement imports',
    pathParameters: ['spaceId', 'statementImportId'],
    bodyResponses: [{ status: '200', schemaRef: 'StatementImportResponseDto' }],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceStatementImports_listStatementImports',
    tag: 'Statement imports',
    pathParameters: ['spaceId'],
    queryParameters: ['fromDate', 'toDate', 'pageSize', 'cursor'],
    queryParameterSchemas: {
      fromDate: DATE_QUERY_SCHEMA,
      toDate: DATE_QUERY_SCHEMA,
      ...PAGINATION_QUERY_SCHEMAS,
    },
    bodyResponses: [
      { status: '200', schemaRef: 'StatementImportHistoryPageResponseDto' },
    ],
    errorResponses: { ...PROTECTED_ERRORS, ...VALIDATED_PATH_ERRORS },
  },
  {
    operationId: 'SpaceStatementImports_commitReviewedStatementImport',
    tag: 'Statement imports',
    requestSchemaRef: 'CommitReviewedStatementImportDto',
    pathParameters: ['spaceId'],
    bodyResponses: [
      {
        status: '201',
        schemaRef: 'StatementImportResponseDto',
        location: `/${API_PREFIX}/users/me/spaces/7/statement-imports/42`,
      },
    ],
    errorResponses: {
      ...PROTECTED_ERRORS,
      ...VALIDATED_PATH_ERRORS,
      '409': 'ProbableDuplicateConflict',
      ...JSON_BODY_ERRORS,
    },
  },
] as const satisfies readonly OperationExpectation[];

const PUBLIC_RESPONSE_SCHEMA_NAMES = [
  'HealthResponseDto',
  'UserResponseDto',
  'SpaceMemberResponseDto',
  'SpaceResponseDto',
  'CategoryResponseDto',
  'BudgetResponseDto',
  'CategorySummaryResponseDto',
  'CategorySummaryItemResponseDto',
  'CategoryRuleResponseDto',
  'CategoryRuleCollectionResponseDto',
  'ManualTransactionResponseDto',
  'ImportedTransactionResponseDto',
  'ManualTransactionHistoryResponseDto',
  'ImportedTransactionHistoryResponseDto',
  'TransactionHistoryPageResponseDto',
  'TransactionActivityResponseDto',
  'StatementImportResponseDto',
  'StatementImportHistoryResponseDto',
  'StatementImportHistoryPageResponseDto',
] as const;

const REQUEST_SCHEMA_SHAPES = {
  CreateCategoryDto: {
    required: ['name'],
    optional: ['description', 'color'],
    nullable: ['description'],
  },
  UpdateCategoryDto: {
    required: ['updatedAt'],
    optional: ['name', 'description', 'isActive', 'color'],
    nullable: ['description'],
  },
  UpsertBudgetDto: {
    required: ['amount', 'period'],
    optional: ['updatedAt'],
    nullable: [],
  },
  CreateCategoryRuleDto: {
    required: ['pattern', 'categoryId'],
    optional: ['matchType'],
    nullable: [],
  },
  UpdateCategoryRuleDto: {
    required: [],
    optional: ['pattern', 'categoryId', 'matchType', 'updatedAt'],
    nullable: [],
  },
  ReplacementCategoryRuleDto: {
    required: ['pattern', 'matchType'],
    optional: [],
    nullable: [],
  },
  ReplaceCategoryRulesDto: {
    required: ['rules'],
    optional: ['revision'],
    nullable: [],
  },
  SpaceReplaceCategoryRulesDto: {
    required: ['revision', 'rules'],
    optional: [],
    nullable: [],
  },
  CreateManualTransactionDto: {
    required: ['purchaseDate', 'description', 'amount'],
    optional: ['categoryId'],
    nullable: ['categoryId'],
  },
  UpdateManualTransactionDto: {
    required: [],
    optional: [
      'purchaseDate',
      'description',
      'amount',
      'categoryId',
      'updatedAt',
    ],
    nullable: ['categoryId'],
  },
  UpdateSpaceTransactionDto: {
    required: ['updatedAt'],
    optional: ['purchaseDate', 'description', 'amount', 'categoryId'],
    nullable: ['categoryId'],
  },
  ReviewedStatementTransactionDto: {
    required: ['purchaseDate', 'description', 'amount'],
    optional: ['categoryId', 'categoryMatchConfidence'],
    nullable: ['categoryId', 'categoryMatchConfidence'],
  },
  CommitReviewedStatementImportDto: {
    required: ['fileName', 'fileHash', 'statementDate', 'bank', 'transactions'],
    optional: ['cardType', 'acknowledgeProbableDuplicates'],
    nullable: ['cardType'],
  },
} as const;

const REQUEST_PROPERTY_ASSERTIONS: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>
> = {
  ReplacementCategoryRuleDto: {
    pattern: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
    matchType: { type: 'string', enum: ['exact', 'contains'] },
  },
  ReplaceCategoryRulesDto: {
    rules: {
      type: 'array',
      items: { $ref: '#/components/schemas/ReplacementCategoryRuleDto' },
    },
  },
  SpaceReplaceCategoryRulesDto: {
    revision: { type: 'string', pattern: '^\\d+$' },
    rules: {
      type: 'array',
      items: { $ref: '#/components/schemas/ReplacementCategoryRuleDto' },
    },
  },
  CreateCategoryDto: {
    name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    description: { type: 'string', maxLength: 500 },
    color: { type: 'string', enum: [...CATEGORY_COLORS] },
  },
  UpdateCategoryDto: {
    name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    description: { type: 'string', maxLength: 500 },
    isActive: { type: 'boolean' },
    color: { type: 'string', enum: [...CATEGORY_COLORS] },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  UpsertBudgetDto: {
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
    },
    period: { type: 'string', enum: ['monthly', 'yearly'] },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  CreateCategoryRuleDto: {
    pattern: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
  },
  UpdateCategoryRuleDto: {
    pattern: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  ReplaceCategoryRulesDto: {
    revision: { type: 'string', pattern: '^\\d+$' },
    rules: {
      type: 'array',
      items: { $ref: '#/components/schemas/ReplacementCategoryRuleDto' },
    },
  },
  CreateManualTransactionDto: {
    purchaseDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: '\\S',
    },
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
    },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$', nullable: true },
  },
  UpdateManualTransactionDto: {
    purchaseDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: '\\S',
    },
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
    },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  UpdateSpaceTransactionDto: {
    purchaseDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: '\\S',
    },
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
    },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  ReviewedStatementTransactionDto: {
    purchaseDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: '\\S',
    },
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d{1,13}\\.\\d{2}$',
    },
    categoryId: { type: 'string', pattern: '^[1-9]\\d*$', nullable: true },
    categoryMatchConfidence: {
      type: 'string',
      pattern: '^(?:0(?:\\.\\d{1,4})?|1(?:\\.0{1,4})?)$',
      nullable: true,
    },
  },
  CommitReviewedStatementImportDto: {
    fileName: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
    fileHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    statementDate: {
      type: 'string',
      format: 'date',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    bank: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    cardType: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '\\S',
      nullable: true,
    },
    transactions: {
      type: 'array',
      items: { $ref: '#/components/schemas/ReviewedStatementTransactionDto' },
    },
    acknowledgeProbableDuplicates: { type: 'boolean' },
  },
};

describe('complete generated OpenAPI contract', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await createOpenApiDocument();
  });

  it('validates as OpenAPI 3.0.3 with complete response bodies and compositions', async () => {
    await expect(
      SwaggerParser.validate(cloneDocument(document)),
    ).resolves.toBeDefined();
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.version).toBe('1.0.0');

    assertLocalReferencesResolve(document);
    assertNonEmptyCompositions(document);
    assertOperationResponseBodies(document);
  });

  it('matches the deliberate production route inventory exactly', () => {
    expect(listOpenApiControllerTypes()).toEqual(
      listProductionControllerTypes(),
    );
    expect(listDocumentRoutes(document)).toEqual(
      listNestRouteInventory().sort(),
    );
    expect(document.paths['/docs']).toBeUndefined();
    expect(document.paths['/docs-json']).toBeUndefined();
    expect(document.paths['/docs-yaml']).toBeUndefined();
    expect(
      listDocumentRoutes(document).some((route) => route.startsWith('HEAD ')),
    ).toBe(false);
    expect(
      listDocumentRoutes(document).some((route) =>
        route.startsWith('OPTIONS '),
      ),
    ).toBe(false);
  });

  it('describes security, requests, responses, media types, statuses, and headers for every operation', () => {
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    expect(document.components?.securitySchemes).toMatchObject({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    });

    const operationIds = new Set<string>();
    for (const route of OPERATION_EXPECTATIONS as readonly OperationExpectation[]) {
      const operation = getOperation(document, route);
      expect(operation.tags).toEqual([route.tag]);
      expect(operation.operationId).toBe(route.operationId);
      expect(operation.operationId).not.toBeUndefined();
      expect(operationIds.has(operation.operationId as string)).toBe(false);
      operationIds.add(operation.operationId as string);

      if (route.public) {
        expect(operation.security).toEqual([]);
      } else if (route.explicitBearerAuth) {
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
      } else {
        expect(operation.security).toBeUndefined();
      }

      if (route.requestSchemaRef === undefined) {
        expect(operation.requestBody).toBeUndefined();
      } else {
        const requestBody = operation.requestBody as RequestBodyObject;
        expect(operation.requestBody).toMatchObject({
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: `#/components/schemas/${route.requestSchemaRef}`,
              },
            },
          },
        });
        expect(Object.keys(requestBody.content)).toEqual(['application/json']);
      }

      expectOperationParameters(operation, route);
      expect(Object.keys(operation.responses).sort()).toEqual(
        [
          ...route.bodyResponses.map(({ status }) => status),
          ...Object.keys(route.errorResponses),
        ].sort(),
      );

      for (const responseContract of route.bodyResponses) {
        expectSuccessResponse(operation, responseContract);
      }
      for (const [status, responseName] of Object.entries(
        route.errorResponses,
      )) {
        expect(operation.responses[status]).toEqual({
          $ref: `#/components/responses/${responseName}`,
        });
      }
    }
  });

  it('keeps request and public response schemas explicit, closed, and free of internal fields', () => {
    for (const schemaName of PUBLIC_RESPONSE_SCHEMA_NAMES) {
      expect(schema(document, schemaName)).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
    }

    const forbiddenResponseFields = new Set([
      'userId',
      'clerkUserId',
      'fileHash',
      'importFingerprint',
      'normalizedPattern',
      'categoryMatchConfidence',
    ]);
    for (const schemaName of PUBLIC_RESPONSE_SCHEMA_NAMES) {
      const exposedFields = collectObjectKeys(schema(document, schemaName));
      expect(
        exposedFields.filter((field) => forbiddenResponseFields.has(field)),
      ).toEqual([]);
    }

    for (const [schemaName, expected] of Object.entries(
      REQUEST_SCHEMA_SHAPES,
    )) {
      const requestSchema = schema(document, schemaName);
      expect(requestSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
      expect(schemaRequired(requestSchema)).toEqual(expected.required);
      expect(Object.keys(schemaProperties(requestSchema)).sort()).toEqual(
        [...expected.required, ...expected.optional].sort(),
      );
      for (const field of expected.nullable) {
        expect(schemaProperties(requestSchema)[field]).toMatchObject({
          nullable: true,
        });
      }
      for (const [field, assertions] of Object.entries(
        REQUEST_PROPERTY_ASSERTIONS[schemaName],
      )) {
        expect(schemaProperties(requestSchema)[field]).toMatchObject(
          assertions,
        );
      }
    }

    expect(schema(document, 'UpdateCategoryDto')).toHaveProperty(
      'minProperties',
      1,
    );
    expect(schema(document, 'UpdateCategoryRuleDto')).toHaveProperty(
      'minProperties',
      1,
    );
    expect(schema(document, 'UpdateManualTransactionDto')).toHaveProperty(
      'minProperties',
      1,
    );

    expect(schema(document, 'SpaceMemberResponseDto')).toMatchObject({
      required: ['id', 'name'],
      properties: {
        id: { type: 'string', pattern: '^[1-9]\\d*$' },
        name: { type: 'string', minLength: 1 },
      },
    });
    expect(schema(document, 'SpaceResponseDto')).toMatchObject({
      required: [
        'id',
        'kind',
        'status',
        'accessLevel',
        'members',
        'createdAt',
        'updatedAt',
      ],
      properties: {
        members: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/components/schemas/SpaceMemberResponseDto' },
        },
      },
    });
  });

  it('models shared errors, distinct conflict examples, and the empty 204 contract', () => {
    const usedErrorNames = new Set(
      OPERATION_EXPECTATIONS.flatMap(({ errorResponses }) =>
        Object.values(errorResponses),
      ),
    );
    expect(new Set(Object.keys(document.components?.responses ?? {}))).toEqual(
      usedErrorNames,
    );

    for (const responseName of usedErrorNames) {
      const responseValue = document.components?.responses?.[responseName];
      if (!responseValue) {
        throw new Error(`Missing response component ${responseName}`);
      }
      const response = resolveResponse(document, responseValue);
      expect(typeof response.description).toBe('string');
      expect(response.content?.['application/json']?.schema).toEqual({
        $ref: '#/components/schemas/ErrorEnvelopeDto',
      });
    }

    const unauthenticatedError =
      document.components?.responses?.UnauthenticatedError;
    if (!unauthenticatedError) {
      throw new Error('Missing response component UnauthenticatedError');
    }
    expect(
      resolveResponse(document, unauthenticatedError).headers,
    ).toMatchObject({
      'WWW-Authenticate': {
        required: true,
        schema: { type: 'string', example: 'Bearer' },
      },
    });

    const probableDuplicateConflict =
      document.components?.responses?.ProbableDuplicateConflict;
    if (!probableDuplicateConflict) {
      throw new Error('Missing response component ProbableDuplicateConflict');
    }
    const examples = resolveResponse(document, probableDuplicateConflict)
      .content?.['application/json']?.examples;
    expect(Object.keys(examples ?? {})).toEqual([
      'fileAlreadyImported',
      'withinSubmission',
      'committedMatch',
      'categoryInactive',
    ]);

    expect(schema(document, 'ErrorEnvelopeDto')).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['error'],
    });
    expect(schema(document, 'ErrorResponseDto')).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'details'],
      properties: {
        details: {
          type: 'array',
          items: {
            oneOf: [
              { $ref: '#/components/schemas/ErrorDetailDto' },
              { $ref: '#/components/schemas/ProbableDuplicateDetailDto' },
              { $ref: '#/components/schemas/CategoryEligibilityDetailDto' },
            ],
          },
        },
      },
    });

    for (const route of OPERATION_EXPECTATIONS) {
      for (const responseContract of route.bodyResponses) {
        const responseValue = getOperation(document, route).responses[
          responseContract.status
        ];
        if (responseContract.status !== '204') {
          continue;
        }
        if (!responseValue) {
          throw new Error(
            `Missing response ${responseContract.status} for ${route.operationId}`,
          );
        }
        const response = resolveResponse(document, responseValue);
        expect(typeof response.description).toBe('string');
        expect(Object.keys(response)).toEqual(['description']);
        expect(response).not.toHaveProperty('content');
      }
    }
  });

  it('keeps generated JSON and YAML semantically equal and byte-for-byte deterministic', async () => {
    const first = await generateOpenApiArtifacts();
    const second = await generateOpenApiArtifacts();
    const committedJson = await readFile(
      resolve(OPENAPI_ARTIFACT_DIRECTORY, OPENAPI_JSON_FILENAME),
      'utf8',
    );
    const committedYaml = await readFile(
      resolve(OPENAPI_ARTIFACT_DIRECTORY, OPENAPI_YAML_FILENAME),
      'utf8',
    );

    expect(first.json).toBe(second.json);
    expect(first.yaml).toBe(second.yaml);
    expect(JSON.parse(first.json)).toEqual(load(first.yaml));
    expect(first.json).toBe(committedJson);
    expect(first.yaml).toBe(committedYaml);
    expect(first.json.endsWith('\n')).toBe(true);
    expect(first.yaml.endsWith('\n')).toBe(true);
  });
});

function getOperation(
  document: OpenAPIObject,
  expectation: OperationExpectation,
): OperationObject {
  const matches = Object.values(document.paths).flatMap((pathItem) =>
    (['get', 'post', 'put', 'patch', 'delete'] as const).flatMap((method) => {
      const operation = pathItem[method];
      return operation?.operationId === expectation.operationId
        ? [operation]
        : [];
    }),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one operation named ${expectation.operationId}, found ${matches.length}`,
    );
  }

  return matches[0];
}

function listNestRouteInventory(): string[] {
  const scanner = new MetadataScanner();
  return listOpenApiControllerTypes().flatMap((controllerType) => {
    const controllerPaths = readMetadataPaths(
      Reflect.getMetadata(PATH_METADATA, controllerType),
    );
    const prototype = controllerType.prototype as Record<string, unknown>;

    return scanner.getAllMethodNames(prototype).flatMap((methodName) => {
      const handler = prototype[methodName];
      if (typeof handler !== 'function') {
        return [];
      }
      const method = explicitRequestMethod(
        Reflect.getMetadata(METHOD_METADATA, handler),
      );
      if (method === undefined) {
        return [];
      }
      const methodPaths = readMetadataPaths(
        Reflect.getMetadata(PATH_METADATA, handler),
      );

      return controllerPaths.flatMap((controllerPath) =>
        methodPaths.map(
          (methodPath) =>
            `${method.toUpperCase()} ${toOpenApiPath(controllerPath, methodPath)}`,
        ),
      );
    });
  });
}

function listOpenApiControllerTypes(): ControllerType[] {
  return listControllerTypesFromModuleImports(listModuleImports(OpenApiModule));
}

function listProductionControllerTypes(): ControllerType[] {
  return listControllerTypesFromModuleImports([
    HealthModule.register({
      provide: DATABASE_READINESS,
      useValue: { isReady: (): Promise<boolean> => Promise.resolve(false) },
    }),
    ...createApiFeatureModules(true),
  ]);
}

function readModuleImports(moduleType: typeof OpenApiModule): unknown {
  return Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleType) as unknown;
}

function listModuleImports(moduleType: typeof OpenApiModule): unknown[] {
  const moduleImports = readModuleImports(moduleType);
  if (!Array.isArray(moduleImports)) {
    throw new Error(`${moduleType.name} has no module imports`);
  }
  return moduleImports;
}

function listControllerTypesFromModuleImports(
  moduleImports: readonly unknown[],
): ControllerType[] {
  const controllerTypes = new Set<ControllerType>();
  const visitedModules = new Set<unknown>();

  function visit(imports: readonly unknown[]): void {
    for (const moduleImport of imports) {
      if (!isRecord(moduleImport) || visitedModules.has(moduleImport)) {
        continue;
      }
      visitedModules.add(moduleImport);

      if (Array.isArray(moduleImport.controllers)) {
        for (const controller of moduleImport.controllers) {
          if (isControllerType(controller)) {
            controllerTypes.add(controller);
          }
        }
      }

      if (Array.isArray(moduleImport.imports)) {
        visit(moduleImport.imports);
      }
    }
  }

  visit(moduleImports);
  return [...controllerTypes];
}

function readMetadataPaths(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((path): path is string => typeof path === 'string');
  }
  return [];
}

function explicitRequestMethod(value: unknown): HttpMethod | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  const method = RequestMethod[value];
  return method === 'GET' ||
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE'
    ? (method.toLowerCase() as HttpMethod)
    : undefined;
}

function toOpenApiPath(controllerPath: string, methodPath: string): string {
  const relativePath = `/${[controllerPath, methodPath]
    .map((path) => path.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`.replace(/:([^/]+)/g, '{$1}');
  return relativePath === `/${HEALTH_PATH}`
    ? relativePath
    : `/${API_PREFIX}${relativePath}`;
}

interface ControllerType {
  prototype: object;
}

function isControllerType(value: unknown): value is ControllerType {
  return typeof value === 'function' && 'prototype' in value;
}

function expectOperationParameters(
  operation: OperationObject,
  route: OperationExpectation,
): void {
  const rawParameters = operation.parameters ?? [];
  expect(rawParameters.every(isParameterObject)).toBe(true);
  const parameters = rawParameters.filter(isParameterObject);
  const pathParameters =
    route.pathParameters ??
    (route.pathParameter === undefined ? [] : [route.pathParameter]);
  const expectedNames = [
    ...pathParameters,
    ...(route.headerParameters ?? []),
    ...(route.queryParameters ?? []),
  ];
  expect(parameters.map(({ name }) => name).sort()).toEqual(
    [...expectedNames].sort(),
  );

  for (const parameter of parameters) {
    const expectedLocation = pathParameters.includes(parameter.name)
      ? 'path'
      : route.headerParameters?.includes(parameter.name) === true
        ? 'header'
        : 'query';
    expect(parameter.in).toBe(expectedLocation);
    const isRequired =
      parameter.in === 'path' ||
      route.requiredHeaderParameters?.includes(parameter.name) === true ||
      route.requiredQueryParameters?.includes(parameter.name) === true;
    expect(parameter.required).toBe(isRequired);
    expect(parameter.schema).toBeDefined();
    const expectedSchema = route.queryParameterSchemas?.[parameter.name];
    if (expectedSchema !== undefined) {
      expect(parameter.schema).toMatchObject(expectedSchema);
    }
    if (parameter.in === 'path') {
      expect(parameter.schema).toMatchObject({
        type: 'string',
        pattern: '^[1-9]\\d*$',
      });
    }
    if (parameter.in === 'header') {
      expect(parameter.required).toBe(
        route.requiredHeaderParameters?.includes(parameter.name) === true,
      );
    }
  }

  expect(Object.keys(route.queryParameterSchemas ?? {}).sort()).toEqual(
    [...(route.queryParameters ?? [])].sort(),
  );
}

function expectSuccessResponse(
  operation: OperationObject,
  responseContract: SuccessResponseContract,
): void {
  const response = operation.responses[
    responseContract.status
  ] as ResponseObject;
  expect(response).toBeDefined();

  if (responseContract.status === '204') {
    expect(response).not.toHaveProperty('content');
  } else {
    expect(response.content?.['application/json']?.schema).toBeDefined();
    expect(Object.keys(response.content ?? {})).toEqual(['application/json']);
  }

  if (responseContract.schemaRef !== undefined) {
    expect(response.content?.['application/json']?.schema).toEqual({
      $ref: `#/components/schemas/${responseContract.schemaRef}`,
    });
  }
  if (responseContract.arrayItemSchemaRef !== undefined) {
    expect(response.content?.['application/json']?.schema).toEqual({
      type: 'array',
      items: {
        $ref: `#/components/schemas/${responseContract.arrayItemSchemaRef}`,
      },
    });
  }
  if (responseContract.unionSchemaRefs !== undefined) {
    const refs = responseContract.unionSchemaRefs.map(
      (schemaName) => `#/components/schemas/${schemaName}`,
    );
    expect(response.content?.['application/json']?.schema).toEqual({
      oneOf: refs.map(($ref) => ({ $ref })),
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: refs[0],
          imported: refs[1],
        },
      },
    });
  }

  if (responseContract.location !== undefined) {
    expect(response).toMatchObject({
      headers: {
        Location: {
          required: true,
          schema: { type: 'string', example: responseContract.location },
        },
      },
    });
  }
}

function listDocumentRoutes(document: OpenAPIObject): string[] {
  return Object.entries(document.paths)
    .flatMap(([path, pathItem]) =>
      (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const)
        .filter((method) => pathItem[method] !== undefined)
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

function isParameterObject(
  parameter: ParameterObject | ReferenceObject,
): parameter is ParameterObject {
  return 'name' in parameter && 'in' in parameter;
}

function schema(
  document: OpenAPIObject,
  name: string,
): Record<string, unknown> {
  return document.components?.schemas?.[name] as unknown as Record<
    string,
    unknown
  >;
}

function schemaProperties(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return isRecord(value.properties) ? value.properties : {};
}

function schemaRequired(value: Record<string, unknown>): unknown[] {
  return Array.isArray(value.required) ? value.required : [];
}

function cloneDocument(document: OpenAPIObject): SwaggerParserDocument {
  return structuredClone(document) as unknown as SwaggerParserDocument;
}

function assertOperationResponseBodies(document: OpenAPIObject): void {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      for (const [status, responseValue] of Object.entries(
        operation.responses,
      )) {
        if (!responseValue) {
          throw new Error(`Missing response object for ${status} ${path}`);
        }
        const response = resolveResponse(document, responseValue);
        if (status === '204') {
          expect(response.content).toBeUndefined();
          continue;
        }
        if (status.startsWith('2')) {
          const responseSchema = response.content?.['application/json']?.schema;
          expect(responseSchema).toBeDefined();
          expect(
            responseSchema && typeof responseSchema === 'object'
              ? Object.keys(responseSchema).length
              : 0,
          ).toBeGreaterThan(0);
        }
      }
    }
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

function assertLocalReferencesResolve(document: OpenAPIObject): void {
  walk(document, (value) => {
    if (!isRecord(value) || typeof value.$ref !== 'string') {
      return;
    }

    const target = resolveLocalPointer(document, value.$ref);
    expect(target).toBeDefined();
  });
}

function assertNonEmptyCompositions(document: OpenAPIObject): void {
  walk(document, (value) => {
    if (!isRecord(value)) {
      return;
    }

    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      const composition = value[key];
      if (composition === undefined) {
        continue;
      }
      expect(Array.isArray(composition)).toBe(true);
      if (!Array.isArray(composition)) {
        continue;
      }
      expect(composition.length).toBeGreaterThan(0);
      const signatures = composition.map((branch) => JSON.stringify(branch));
      expect(new Set(signatures).size).toBe(signatures.length);
    }

    if (!('discriminator' in value) || !isRecord(value.discriminator)) {
      return;
    }
    expect(typeof value.discriminator.propertyName).toBe('string');
    if ('mapping' in value.discriminator) {
      const mapping = value.discriminator.mapping;
      expect(isRecord(mapping)).toBe(true);
      if (!isRecord(mapping)) {
        return;
      }
      const mappingValues = Object.values(mapping);
      expect(mappingValues.length).toBeGreaterThan(0);
      const mappingRefs = mappingValues.filter(
        (entry): entry is string => typeof entry === 'string',
      );
      expect(mappingRefs.length).toBe(mappingValues.length);

      const oneOf = value.oneOf;
      if (!Array.isArray(oneOf)) {
        return;
      }
      const branchRefs = oneOf.flatMap((branch) =>
        isRecord(branch) && typeof branch.$ref === 'string'
          ? [branch.$ref]
          : [],
      );
      if (branchRefs.length > 0) {
        expect(mappingRefs.every((ref) => branchRefs.includes(ref))).toBe(true);
        if (branchRefs.length === oneOf.length) {
          expect(new Set(mappingRefs)).toEqual(new Set(branchRefs));
          const propertyName = value.discriminator.propertyName;
          if (typeof propertyName === 'string') {
            for (const branchRef of branchRefs) {
              expect(
                schemaDeclaresProperty(document, branchRef, propertyName),
              ).toBe(true);
            }
          }
        }
      }
    }
  });
}

function schemaDeclaresProperty(
  document: OpenAPIObject,
  ref: string,
  propertyName: string,
  visitedRefs = new Set<string>(),
): boolean {
  if (visitedRefs.has(ref)) {
    return false;
  }
  visitedRefs.add(ref);
  const value = resolveLocalPointer(document, ref);
  if (!isRecord(value)) {
    return false;
  }
  if (isRecord(value.properties) && propertyName in value.properties) {
    return true;
  }
  if (Array.isArray(value.allOf)) {
    return value.allOf.some((branch) => {
      if (!isRecord(branch) || typeof branch.$ref !== 'string') {
        return false;
      }
      return schemaDeclaresProperty(
        document,
        branch.$ref,
        propertyName,
        visitedRefs,
      );
    });
  }
  return false;
}

function resolveLocalPointer(document: OpenAPIObject, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((current, part) => {
      if (!isRecord(current)) {
        return undefined;
      }
      return current[part];
    }, document);
}

function collectObjectKeys(value: unknown): string[] {
  const keys: string[] = [];
  walk(value, (current) => {
    if (isRecord(current) && isRecord(current.properties)) {
      keys.push(...Object.keys(current.properties));
    }
  });
  return keys;
}

function walk(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  Object.values(value).forEach((item) => walk(item, visit));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
