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
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';
import { CategoryRulesService } from '../application/category-rules.service';
import {
  CreateCategoryRuleDto,
  SpaceCategoryRuleParamsDto,
  UpdateCategoryRuleDto,
} from './category-rule.dto';
import {
  CategoryRuleCollectionResponseDto,
  CategoryRuleResponseDto,
} from './category-rule-response.dto';
import {
  normalizeIfMatch,
  toCategoryRuleCollectionResponse,
  toCategoryRuleResponse,
  toCategoryRuleUpdate,
} from './category-rule-response.mapper';

@Controller('users/me/spaces/:spaceId/category-rules')
@ApiTags('Category rules')
@ApiExtraModels(
  CategoryRuleCollectionResponseDto,
  CategoryRuleResponseDto,
  CreateCategoryRuleDto,
  UpdateCategoryRuleDto,
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
export class SpaceCategoryRulesController {
  constructor(
    private readonly categoryRulesService: CategoryRulesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a Category Rule in an authorized Space.',
    description:
      'Matching normalizes surrounding and repeated whitespace and compares case-insensitively. The rule is shared by every member of the Space.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Category rule created.',
    type: CategoryRuleResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Category rule.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/spaces/7/category-rules/42`,
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
  async createCategoryRule(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: CreateCategoryRuleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const rule = await this.categoryRulesService.createCategoryRuleInSpace(
      params.spaceId,
      input,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      spaceCategoryRuleLocation(params.spaceId, rule.id),
    );
    return toCategoryRuleResponse(rule);
  }

  @Get()
  @ApiOperation({
    summary: 'List Category Rules in an authorized Space.',
    description:
      'The revision covers the complete Space collection, including an empty collection, and is required for stale replacement detection.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category Rules and their Space-scoped revision.',
    type: CategoryRuleCollectionResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listCategoryRules(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
  ): Promise<CategoryRuleCollectionResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toCategoryRuleCollectionResponse(
      await this.categoryRulesService.listCategoryRulesInSpace(params.spaceId),
    );
  }

  @Get(':ruleId')
  @ApiOperation({ summary: 'Get a Category Rule in an authorized Space.' })
  @ApiParam({
    name: 'ruleId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category rule.',
    type: CategoryRuleResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getCategoryRule(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryRuleParamsDto,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toCategoryRuleResponse(
      await this.categoryRulesService.getCategoryRuleInSpace(
        params.spaceId,
        params.ruleId,
      ),
    );
  }

  @Patch(':ruleId')
  @ApiOperation({
    summary: 'Update or reassign a Category Rule in an authorized Space.',
    description:
      'The optional updatedAt timestamp rejects a stale edit. A Category Rule may be reassigned only to an active Category in the same Space.',
  })
  @ApiParam({
    name: 'ruleId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category rule updated.',
    type: CategoryRuleResponseDto,
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
  async updateCategoryRule(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryRuleParamsDto,
    @Body() input: UpdateCategoryRuleDto,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    return toCategoryRuleResponse(
      await this.categoryRulesService.updateCategoryRuleInSpace(
        params.spaceId,
        params.ruleId,
        toCategoryRuleUpdate(input),
      ),
    );
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a Category Rule in an authorized Space.' })
  @ApiParam({
    name: 'ruleId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiHeader({
    name: 'if-match',
    required: false,
    description:
      'Optional Category Rule updatedAt timestamp. The delete is rejected when it is stale.',
    schema: { type: 'string', format: 'date-time' },
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Category rule deleted.',
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async deleteCategoryRule(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryRuleParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    await this.categoryRulesService.deleteCategoryRuleInSpace(
      params.spaceId,
      params.ruleId,
      normalizeIfMatch(ifMatch),
    );
  }
}

function spaceCategoryRuleLocation(spaceId: string, ruleId: string): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/category-rules/${ruleId}`;
}
