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
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { BudgetsService } from '../application/budgets.service';
import type { BudgetRecord, UpdateBudget } from '../application/budget-store';
import { BudgetResponseDto } from './budget-response.dto';
import { UpsertBudgetDto } from './budget.dto';
import { SpaceCategoryParamsDto } from './space-category.dto';

@Controller('users/me/spaces/:spaceId/categories/:categoryId/budget')
@ApiTags('Budgets')
@ApiExtraModels(BudgetResponseDto, UpsertBudgetDto)
@ApiParam({
  name: 'spaceId',
  description: 'Positive bigint Space identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  },
})
@ApiParam({
  name: 'categoryId',
  description: 'Positive bigint Category identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  },
})
export class SpaceBudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Put()
  @ApiOperation({
    summary: 'Create or replace a Budget in an authorized Space.',
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
          example: `/${API_PREFIX}/users/me/spaces/7/categories/42/budget`,
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
    @Param() params: SpaceCategoryParamsDto,
    @Body() input: UpsertBudgetDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BudgetResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const result = await this.budgetsService.putBudgetInSpace(
      params.spaceId,
      params.categoryId,
      toBudgetUpdate(input),
    );
    if (result.created) {
      response.status(HttpStatus.CREATED);
      response.setHeader('Location', spaceBudgetLocation(params));
    }

    return toBudgetResponse(result.budget);
  }

  @Get()
  @ApiOperation({ summary: 'Get a Category Budget in an authorized Space.' })
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
    @Param() params: SpaceCategoryParamsDto,
  ): Promise<BudgetResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toBudgetResponse(
      await this.budgetsService.getBudgetInSpace(
        params.spaceId,
        params.categoryId,
      ),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a Category Budget in an authorized Space.' })
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
    'ConflictError',
    'NotAcceptableError',
    'InternalError',
  )
  async deleteBudget(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    await this.budgetsService.deleteBudgetInSpace(
      params.spaceId,
      params.categoryId,
      normalizeIfMatch(ifMatch),
    );
  }
}

function toBudgetUpdate(input: UpsertBudgetDto): UpdateBudget {
  return {
    amount: input.amount,
    period: input.period,
    ...(input.updatedAt === undefined
      ? {}
      : { expectedUpdatedAt: input.updatedAt }),
  };
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

function spaceBudgetLocation(params: SpaceCategoryParamsDto): string {
  return `/${API_PREFIX}/users/me/spaces/${params.spaceId}/categories/${params.categoryId}/budget`;
}

function normalizeIfMatch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}
