import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
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
  constructor(private readonly budgetsService: BudgetsService) {}

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
    const result = await this.budgetsService.putBudget(
      requireAuthenticatedUserId(request),
      params.categoryId,
      input,
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
    return toBudgetResponse(
      await this.budgetsService.getBudget(
        requireAuthenticatedUserId(request),
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
  ): Promise<void> {
    await this.budgetsService.deleteBudget(
      requireAuthenticatedUserId(request),
      params.categoryId,
    );
  }
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
