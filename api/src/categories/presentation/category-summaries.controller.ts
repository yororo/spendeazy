import { Controller, Get, HttpStatus, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import {
  CategorySummariesService,
  type CategorySummaryResult,
} from '../application/category-summaries.service';
import { CategorySummaryQueryDto } from './category-summary.dto';
import {
  CategorySummaryItemResponseDto,
  CategorySummaryResponseDto,
} from './category-summary-response.dto';

@Controller('users/me/category-summaries')
@ApiTags('Category summaries')
@ApiExtraModels(CategorySummaryResponseDto, CategorySummaryItemResponseDto)
export class CategorySummariesController {
  constructor(
    private readonly categorySummariesService: CategorySummariesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get a complete monthly or yearly calendar-period summary.',
    description:
      'Active categories are included even with no spending; inactive categories remain only when they have spending, and results are ordered by category ID. The month requirement depends on period and is enforced at runtime because OpenAPI cannot express that cross-field rule. Unknown query parameters are rejected.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category summary.',
    type: CategorySummaryResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotAcceptableError',
    'InternalError',
  )
  async getCategorySummary(
    @Req() request: AuthenticatedRequest,
    @Query() query: CategorySummaryQueryDto,
  ): Promise<CategorySummaryResponseDto> {
    const summary = await this.categorySummariesService.getCategorySummary(
      requireAuthenticatedUserId(request),
      query,
    );
    return toCategorySummaryResponse(summary);
  }
}

export function toCategorySummaryResponse(
  summary: CategorySummaryResult,
): CategorySummaryResponseDto {
  return {
    period: summary.period,
    year: summary.year,
    month: summary.month,
    categories: summary.categories.map(toCategorySummaryItemResponse),
    uncategorizedTotal: summary.uncategorizedTotal,
    uncategorizedCount: summary.uncategorizedCount,
  };
}

function toCategorySummaryItemResponse(
  item: CategorySummaryResult['categories'][number],
): CategorySummaryItemResponseDto {
  return {
    categoryId: item.categoryId,
    name: item.name,
    isActive: item.isActive,
    totalAmount: item.totalAmount,
    transactionCount: item.transactionCount,
    budgetAmount: item.budgetAmount,
    remainingAmount: item.remainingAmount,
  };
}
