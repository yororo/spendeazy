import { Body, Controller, HttpStatus, Param, Put, Req } from '@nestjs/common';
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
import { CategoryRulesService } from '../application/category-rules.service';
import {
  SpaceCategoryRuleCategoryParamsDto,
  SpaceReplaceCategoryRulesDto,
} from './category-rule.dto';
import { CategoryRuleCollectionResponseDto } from './category-rule-response.dto';
import { toCategoryRuleCollectionResponse } from './category-rule-response.mapper';

@Controller('users/me/spaces/:spaceId/categories/:categoryId/rules')
@ApiTags('Category rules')
@ApiExtraModels(SpaceReplaceCategoryRulesDto, CategoryRuleCollectionResponseDto)
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
export class SpaceCategoryRuleReplacementController {
  constructor(
    private readonly categoryRulesService: CategoryRulesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Put()
  @ApiOperation({
    summary: 'Replace the complete Category Rule set in an authorized Space.',
    description:
      'Atomic replacement for one active Category. The submitted revision is checked while the Space is locked; stale replacements are rejected. Unchanged normalized pattern/match type pairs retain IDs and createdAt, and unchanged display patterns retain updatedAt. Empty rules clears the selected Category. Rules on other Categories remain unchanged. Duplicate normalized pattern/match type pairs within the request or another Category in the Space return 409.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Persisted Space Category Rule collection and revision.',
    type: CategoryRuleCollectionResponseDto,
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
  async replaceCategoryRules(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryRuleCategoryParamsDto,
    @Body() input: SpaceReplaceCategoryRulesDto,
  ): Promise<CategoryRuleCollectionResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    return toCategoryRuleCollectionResponse(
      await this.categoryRulesService.replaceCategoryRulesInSpace(
        params.spaceId,
        params.categoryId,
        input.rules,
        input.revision,
      ),
    );
  }
}
