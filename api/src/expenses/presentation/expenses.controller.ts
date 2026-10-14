import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../config/app-config';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import type {
  ManualExpenseRecord,
  ExpenseRecord,
} from '../application/expense-store';
import type { ExpenseActivityRecord } from '../application/expense-activity-store';
import { ExpensesService } from '../application/expenses.service';
import {
  CreateManualExpenseDto,
  ExpenseCollectionQueryDto,
  ExpenseParamsDto,
  UpdateManualExpenseDto,
} from './expense.dto';
import {
  ImportedExpenseHistoryResponseDto,
  ImportedExpenseResponseDto,
  ManualExpenseHistoryResponseDto,
  ManualExpenseResponseDto,
  ExpenseHistoryPageResponseDto,
  ExpenseActivitySnapshotDto,
  ExpenseActivityResponseDto,
} from './expense-response.dto';

@Controller('users/me/expenses')
@ApiTags('Expenses')
@ApiExtraModels(
  CreateManualExpenseDto,
  UpdateManualExpenseDto,
  ManualExpenseResponseDto,
  ImportedExpenseResponseDto,
  ManualExpenseHistoryResponseDto,
  ImportedExpenseHistoryResponseDto,
  ExpenseHistoryPageResponseDto,
  ExpenseActivitySnapshotDto,
  ExpenseActivityResponseDto,
)
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a manual expense.' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Manual expense created.',
    type: ManualExpenseResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Expense.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/expenses/42`,
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async createManualExpense(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateManualExpenseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ManualExpenseResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalWriteSpace(userId);
    const expense =
      await this.expensesService.createManualExpenseInSpace(
        userId,
        personalSpace.id,
        input,
      );
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', expenseLocation(expense.id));
    return toManualExpenseResponse(expense);
  }

  @Get()
  @ApiOperation({
    summary:
      'List filtered expenses in date-descending, ID-descending keyset pages.',
    description:
      'Returns manual and imported Expenses in the authorized Space in purchaseDate descending, then Expense ID descending order. fromDate and toDate are inclusive valid calendar-date filters and fromDate must be on or before toDate. pageSize must be between 1 and 100 and defaults to 20. The nextCursor is opaque, binds to every filter except pageSize, and must be reused with the same filters. Unknown query parameters are rejected.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense page.',
    type: ExpenseHistoryPageResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
  )
  async listExpenses(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExpenseCollectionQueryDto,
  ): Promise<ExpenseHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalSpace(userId);
    const page = await this.expensesService.listExpensesInSpace(
      personalSpace.id,
      query,
    );
    return {
      items: page.items.map(toExpenseHistoryResponse),
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'List retained deleted Expenses.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Retained deleted Expense history page.',
    type: ExpenseHistoryPageResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
  )
  async listDeletedExpenses(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExpenseCollectionQueryDto,
  ): Promise<ExpenseHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalSpace(userId);
    const page = await this.expensesService.listDeletedExpensesInSpace(
      personalSpace.id,
      query,
    );
    return {
      items: page.items.map(toExpenseHistoryResponse),
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
    };
  }

  @Get(':expenseId/activity')
  @ApiOperation({ summary: 'List activity for an Expense.' })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense activity events.',
    type: ExpenseActivityResponseDto,
    isArray: true,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'NotFoundError',
    'InternalError',
  )
  async listExpenseActivity(
    @Req() request: AuthenticatedRequest,
    @Param() params: ExpenseParamsDto,
  ): Promise<ExpenseActivityResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalSpace(userId);
    const activity =
      await this.expensesService.listExpenseActivityInSpace(
        personalSpace.id,
        params.expenseId,
      );
    return activity.map(toExpenseActivityResponse);
  }

  @Get(':expenseId')
  @ApiOperation({ summary: 'Get a manual expense.' })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Manual expense.',
    type: ManualExpenseResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
    'NotFoundError',
  )
  async getManualExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: ExpenseParamsDto,
  ): Promise<ManualExpenseResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalSpace(userId);
    return toManualExpenseResponse(
      await this.expensesService.getManualExpenseInSpace(
        personalSpace.id,
        params.expenseId,
      ),
    );
  }

  @Patch(':expenseId')
  @ApiOperation({
    summary:
      'Update a manual expense or recategorize an imported expense.',
    description:
      'Manual Expenses may be patched with any supplied fields. Imported Expenses may only change categoryId; their statement facts are immutable and any other field causes a 409 Conflict.',
  })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense updated.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ManualExpenseResponseDto) },
        { $ref: getSchemaPath(ImportedExpenseResponseDto) },
      ],
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: getSchemaPath(ManualExpenseResponseDto),
          imported: getSchemaPath(ImportedExpenseResponseDto),
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  async updateExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: ExpenseParamsDto,
    @Body() input: UpdateManualExpenseDto,
  ): Promise<ExpenseResponse> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalWriteSpace(userId);
    const changes = toExpenseUpdate(input);
    return toExpenseResponse(
      await this.expensesService.updateExpenseInSpace(
        userId,
        personalSpace.id,
        params.expenseId,
        changes,
      ),
    );
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a manual expense.' })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Manual expense deleted.',
  })
  @ApiHeader({
    name: 'if-match',
    required: false,
    description:
      'Optional Expense updatedAt timestamp. The delete is rejected when it is stale.',
    schema: { type: 'string' },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
    'NotFoundError',
    'ConflictError',
  )
  async deleteManualExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: ExpenseParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalWriteSpace(userId);
    const expectedUpdatedAt = normalizeIfMatch(ifMatch);
    await this.expensesService.deleteManualExpenseInSpace(
      userId,
      personalSpace.id,
      params.expenseId,
      expectedUpdatedAt,
    );
  }
}

export type ExpenseResponse =
  ManualExpenseResponseDto | ImportedExpenseResponseDto;

export type ExpenseHistoryResponse =
  ManualExpenseHistoryResponseDto | ImportedExpenseHistoryResponseDto;

export type ExpenseHistoryPageResponse = ExpenseHistoryPageResponseDto;

type ExpenseResponseInput = Pick<
  ExpenseRecord,
  | 'id'
  | 'categoryId'
  | 'purchaseDate'
  | 'description'
  | 'amount'
  | 'source'
  | 'addedByUserId'
  | 'createdAt'
  | 'updatedAt'
>;

type ExpenseResponseFields = Omit<ManualExpenseResponseDto, 'source'>;

export function toExpenseResponse(
  expense: ExpenseResponseInput,
): ExpenseResponse {
  const response = toExpenseResponseFields(expense);

  return expense.source === 'manual'
    ? { ...response, source: 'manual' }
    : { ...response, source: 'imported' };
}

export function toManualExpenseResponse(
  expense: ManualExpenseRecord,
): ManualExpenseResponseDto {
  return {
    ...toExpenseResponseFields(expense),
    source: 'manual',
  };
}

export function toExpenseHistoryResponse(
  expense: ExpenseRecord,
): ExpenseHistoryResponse {
  const response = toExpenseResponseFields(expense);

  const historyResponse = {
    ...response,
    ...(expense.deletedAt == null
      ? {}
      : { deletedAt: expense.deletedAt.toISOString() }),
  };

  if (expense.source === 'manual') {
    return {
      ...historyResponse,
      source: 'manual',
      statementImportId: null,
    };
  }

  if (expense.statementImportId === null) {
    throw new Error('Imported Expenses must reference a Statement import');
  }

  return {
    ...historyResponse,
    source: 'imported',
    statementImportId: expense.statementImportId,
  };
}

export function toExpenseActivityResponse(
  activity: ExpenseActivityRecord,
): ExpenseActivityResponseDto {
  const response = {
    id: activity.id,
    expenseId: activity.expenseId,
    type: activity.type,
    actorUserId: activity.actorUserId,
    occurredAt: activity.occurredAt.toISOString(),
  };

  if (activity.type !== 'edited') {
    return response;
  }

  if (activity.before === undefined || activity.after === undefined) {
    throw new Error('Edited Expense activity is missing its snapshots');
  }

  return {
    ...response,
    before: activity.before,
    after: activity.after,
  };
}

function toExpenseResponseFields(
  expense: ExpenseResponseInput,
): ExpenseResponseFields {
  return {
    id: expense.id,
    categoryId: expense.categoryId,
    purchaseDate: expense.purchaseDate,
    description: expense.description,
    amount: expense.amount,
    ...(expense.addedByUserId === undefined
      ? {}
      : { addedByUserId: expense.addedByUserId }),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

function toExpenseUpdate(
  input: UpdateManualExpenseDto,
): Parameters<ExpensesService['updateExpenseInSpace']>[3] {
  const { updatedAt, ...changes } = input;
  return {
    ...changes,
    ...(updatedAt === undefined ? {} : { expectedUpdatedAt: updatedAt }),
  };
}

function normalizeIfMatch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

function expenseLocation(expenseId: string): string {
  return `/${API_PREFIX}/users/me/expenses/${expenseId}`;
}
