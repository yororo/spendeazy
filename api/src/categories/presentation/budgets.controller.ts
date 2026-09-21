import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Put,
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
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../config/app-config';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import type { BudgetRecord } from '../application/budget-store';
import { BudgetsService } from '../application/budgets.service';
import { BudgetResponseDto } from './budget-response.dto';
import { UpsertBudgetDto } from './budget.dto';
import { CategoryParamsDto } from './category.dto';
import { SpaceAccessService } from '../../spaces/application/space-access.service';

@Controller('users/me/categories/:categoryId/budget')
@ApiTags('Budgets')
@ApiExtraModels(BudgetResponseDto, UpsertBudgetDto)
@ApiParam({
  name: 'categoryId',
  description: 'Positive bigint identifier encoded as a decimal JSON string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  },
})
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Put()
  @ApiOperation({
    summary: 'Create or replace the category budget.',
    description:
      'A new Budget returns 201 with Location; replacing an existing Budget returns 200. An inactive Category cannot receive a new Budget, although an existing Budget may still be replaced.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Budget replaced.',
    type: BudgetResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Budget created.',
    type: BudgetResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Budget.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/categories/42/budget`,
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
  async putBudget(
    @Req() request: AuthenticatedRequest,
    @Param() params: CategoryParamsDto,
    @Body() input: UpsertBudgetDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BudgetResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalWriteSpace(userId);
    const result = await this.budgetsService.putBudgetInSpace(
      personalSpace.id,
      params.categoryId,
      toBudgetUpdate(input),
    );
    if (result.created) {
      response.status(HttpStatus.CREATED);
      response.setHeader('Location', budgetLocation(params.categoryId));
    }

    return toBudgetResponse(result.budget);
  }

  @Get()
  @ApiOperation({ summary: 'Get a category budget.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Budget.',
    type: BudgetResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getBudget(
    @Req() request: AuthenticatedRequest,
    @Param() params: CategoryParamsDto,
  ): Promise<BudgetResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalReadSpace(userId);
    return toBudgetResponse(
      await this.budgetsService.getBudgetInSpace(
        personalSpace.id,
        params.categoryId,
      ),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category budget.' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Budget deleted.',
  })
  @ApiHeader({
    name: 'if-match',
    required: false,
    description:
      'Optional Budget updatedAt timestamp. The delete is rejected when it is stale.',
    schema: { type: 'string' },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async deleteBudget(
    @Req() request: AuthenticatedRequest,
    @Param() params: CategoryParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalWriteSpace(userId);
    await this.budgetsService.deleteBudgetInSpace(
      personalSpace.id,
      params.categoryId,
      normalizeIfMatch(ifMatch),
    );
  }

  private requirePersonalReadSpace(userId: string) {
    return this.spaceAccessService.requirePersonalSpace(userId);
  }

  private requirePersonalWriteSpace(userId: string) {
    return this.spaceAccessService.requirePersonalWriteSpace(userId);
  }
}

function toBudgetUpdate(input: UpsertBudgetDto) {
  return {
    amount: input.amount,
    period: input.period,
    ...(input.updatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.updatedAt }),
  };
}

function normalizeIfMatch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

export function toBudgetResponse(budget: BudgetRecord): BudgetResponseDto {
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    amount: budget.amount,
    period: budget.period,
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}

function budgetLocation(categoryId: string): string {
  return `/${API_PREFIX}/users/me/categories/${categoryId}/budget`;
}
