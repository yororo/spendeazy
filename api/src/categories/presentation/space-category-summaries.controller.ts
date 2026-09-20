import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { CategorySummariesService } from '../application/category-summaries.service';
import { CategorySummaryQueryDto } from './category-summary.dto';
import {
  CategorySummaryItemResponseDto,
  CategorySummaryResponseDto,
} from './category-summary-response.dto';
import { toCategorySummaryResponse } from './category-summaries.controller';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';

@Controller('users/me/spaces/:spaceId/category-summaries')
@ApiTags('Category summaries')
@ApiExtraModels(CategorySummaryResponseDto, CategorySummaryItemResponseDto)
@ApiParam({
  name: 'spaceId',
  description: 'Positive bigint Space identifier encoded as a string.',
  schema: {
    type: 'string',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '7',
  },
})
export class SpaceCategorySummariesController {
  constructor(
    private readonly categorySummariesService: CategorySummariesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get a Category summary for an authorized Space.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category summary.',
    type: CategorySummaryResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getCategorySummary(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Query() query: CategorySummaryQueryDto,
  ): Promise<CategorySummaryResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const summary =
      await this.categorySummariesService.getCategorySummaryInSpace(
        params.spaceId,
        query,
      );
    return toCategorySummaryResponse(summary);
  }
}
