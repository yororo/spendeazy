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
import { RequestValidationError } from '../../http/request-validation-error';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { ExpensesService } from '../application/expenses.service';
import {
  CreateManualExpenseDto,
  ExpenseCollectionQueryDto,
  UpdateManualExpenseDto,
  UpdateSpaceExpenseDto,
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
import {
  toManualExpenseResponse,
  toExpenseActivityResponse,
  toExpenseHistoryResponse,
  toExpenseResponse,
} from './expense-response.mapper';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { SpaceExpenseParamsDto } from './space-expense.dto';

@Controller('users/me/spaces/:spaceId/expenses')
@ApiTags('Expenses')
@ApiExtraModels(
  CreateManualExpenseDto,
  UpdateManualExpenseDto,
  UpdateSpaceExpenseDto,
  ManualExpenseResponseDto,
  ImportedExpenseResponseDto,
  ManualExpenseHistoryResponseDto,
  ImportedExpenseHistoryResponseDto,
  ExpenseHistoryPageResponseDto,
  ExpenseActivitySnapshotDto,
  ExpenseActivityResponseDto,
)
@ApiParam({
  name: 'spaceId',
  description: 'Positive bigint Space identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  },
})
export class SpaceExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a manual Expense in an authorized Space.',
  })
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
          example: `/${API_PREFIX}/users/me/spaces/7/expenses/42`,
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
  async createExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: CreateManualExpenseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ManualExpenseResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const expense = await this.expensesService.createManualExpenseInSpace(
      userId,
      params.spaceId,
      input,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      spaceExpenseLocation(params.spaceId, expense.id),
    );
    return toManualExpenseResponse(expense);
  }

  @Get()
  @ApiOperation({
    summary: 'List Expenses in an authorized Space.',
    description:
      'Returns manual and imported Expenses only after authorizing the requested Space. Active pages default to expenseDate descending then Expense ID descending; sort=oldest reverses both. Cursors are bound to the Space, filters, deletion selection and sort; page size is not part of a cursor. Deleted Expense pages use deletedAt descending then Expense ID descending.',
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
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listExpenses(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: ExpenseCollectionQueryDto,
  ): Promise<ExpenseHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const page = await this.expensesService.listExpensesInSpace(
      params.spaceId,
      query,
    );
    return {
      expenses: page.items.map(toExpenseHistoryResponse),
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
      totalAmount: page.totalAmount,
    };
  }

  @Get('deleted')
  @ApiOperation({ summary: 'List retained deleted Expenses in a Space.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Retained deleted Expense history page.',
    type: ExpenseHistoryPageResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listDeletedExpenses(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: ExpenseCollectionQueryDto,
  ): Promise<ExpenseHistoryPageResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const page = await this.expensesService.listDeletedExpensesInSpace(
      params.spaceId,
      query,
    );
    return {
      expenses: page.items.map(toExpenseHistoryResponse),
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
      totalAmount: page.totalAmount,
    };
  }

  @Get(':expenseId/activity')
  @ApiOperation({
    summary: 'List activity for a Expense in an authorized Space.',
  })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint Expense identifier encoded as a string.',
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
    @Param() params: SpaceExpenseParamsDto,
  ): Promise<ExpenseActivityResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const activity = await this.expensesService.listExpenseActivityInSpace(
      params.spaceId,
      params.expenseId,
    );
    return activity.map(toExpenseActivityResponse);
  }

  @Get(':expenseId')
  @ApiOperation({ summary: 'Get an Expense in an authorized Space.' })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint Expense identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Expense, including retained deletion history when the Expense has been deleted.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ManualExpenseHistoryResponseDto) },
        { $ref: getSchemaPath(ImportedExpenseHistoryResponseDto) },
      ],
      discriminator: {
        propertyName: 'source',
        mapping: {
          manual: getSchemaPath(ManualExpenseHistoryResponseDto),
          imported: getSchemaPath(ImportedExpenseHistoryResponseDto),
        },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceExpenseParamsDto,
  ) {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toExpenseHistoryResponse(
      await this.expensesService.getExpenseInSpace(
        params.spaceId,
        params.expenseId,
      ),
    );
  }

  @Patch(':expenseId')
  @ApiOperation({
    summary: 'Update an Expense in an authorized Space.',
    description:
      'Manual and imported Expenses may be edited in any writable Space. Statement Import provenance and Added By attribution remain unchanged. The required expectedRevision rejects stale edits.',
  })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint Expense identifier encoded as a string.',
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
    @Param() params: SpaceExpenseParamsDto,
    @Body() input: UpdateSpaceExpenseDto,
  ) {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const expectedRevision = requireScopedExpenseVersion(
      input.expectedRevision,
      '/expectedRevision',
    );
    const changes = { ...toExpenseUpdate(input), expectedRevision };
    const updatedExpense =
      await this.expensesService.updateSharedExpenseInSpace(
        userId,
        params.spaceId,
        params.expenseId,
        changes,
      );
    return toExpenseResponse(updatedExpense);
  }

  @Delete(':expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an Expense in an authorized Space.',
  })
  @ApiParam({
    name: 'expenseId',
    description: 'Positive bigint Expense identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Expense deleted and retained for history.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ManualExpenseHistoryResponseDto) },
        { $ref: getSchemaPath(ImportedExpenseHistoryResponseDto) },
      ],
    },
  })
  @ApiHeader({
    name: 'if-match',
    required: true,
    description:
      'Expense revision from the last read. The delete is rejected when it is stale.',
    schema: { type: 'string' },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'NotAcceptableError',
    'InternalError',
  )
  async deleteExpense(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceExpenseParamsDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const expectedRevision = requireScopedExpenseVersion(
      normalizeIfMatch(ifMatch),
      '/headers/if-match',
    );
    return toExpenseHistoryResponse(
      await this.expensesService.deleteExpenseInSpace(
        userId,
        params.spaceId,
        params.expenseId,
        expectedRevision,
      ),
    );
  }
}

function toExpenseUpdate(
  input: UpdateSpaceExpenseDto,
): Parameters<ExpensesService['updateSharedExpenseInSpace']>[3] {
  const { expectedRevision, ...changes } = input;
  return {
    ...changes,
    expectedRevision,
  };
}

function normalizeIfMatch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

function requireScopedExpenseVersion(
  value: string | undefined,
  field = '/expectedRevision',
): string {
  const normalized = value?.trim();
  if (!normalized || !POSITIVE_INTEGER_ID_PATTERN.test(normalized)) {
    throw new RequestValidationError([
      {
        field,
        code: 'required',
        message: 'An Expense revision is required for Space writes.',
      },
    ]);
  }

  return normalized;
}

function spaceExpenseLocation(spaceId: string, expenseId: string): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/expenses/${expenseId}`;
}
