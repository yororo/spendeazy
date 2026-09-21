import { Body, Controller, HttpStatus, Param, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { CategoryRulesService } from '../application/category-rules.service';
import {
  CategoryRuleCategoryParamsDto,
  ReplaceCategoryRulesDto,
} from './category-rule.dto';
import { CategoryRuleResponseDto } from './category-rule-response.dto';
import { toCategoryRuleResponse } from './category-rule-response.mapper';

@Controller('users/me/categories/:categoryId/rules')
@ApiTags('Category rules')
export class CategoryRuleReplacementController {
  constructor(
    private readonly categoryRulesService: CategoryRulesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Put()
  @ApiOperation({
    summary: 'Replace the complete rule set for an active Category.',
    description:
      "Legacy personal compatibility route. Atomic replacement resolves the authenticated User's Personal Space; when a revision is supplied, stale replacements are rejected. Unchanged normalized pattern/match type pairs retain IDs and createdAt; unchanged display patterns also retain updatedAt. Empty rules clears the set. Returns ascending ID order. Duplicate normalized pattern/match type pairs within the request or another Personal Space Category return 409 with the conflicting categoryId and request field. Inactive Categories return 409, including empty replacements. Validation and conflict failures change nothing.",
  })
  @ApiParam({
    name: 'categoryId',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Persisted rules for the selected Category.',
    type: CategoryRuleResponseDto,
    isArray: true,
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
    @Param() params: CategoryRuleCategoryParamsDto,
    @Body() input: ReplaceCategoryRulesDto,
  ): Promise<CategoryRuleResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace =
      await this.spaceAccessService.requirePersonalWriteSpace(userId);
    const rules = (
      await this.categoryRulesService.replaceCategoryRulesInSpace(
        personalSpace.id,
        params.categoryId,
        input.rules,
        input.revision,
      )
    ).rules;
    return rules.map(toCategoryRuleResponse);
  }
}
