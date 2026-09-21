import {
  Body,
  Controller,
  Delete,
  Headers,
  Get,
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
import { CategoryRulesService } from '../application/category-rules.service';
import {
  CategoryRuleParamsDto,
  CreateCategoryRuleDto,
  UpdateCategoryRuleDto,
} from './category-rule.dto';
import { CategoryRuleResponseDto } from './category-rule-response.dto';
import {
  normalizeIfMatch,
  toCategoryRuleResponse,
  toCategoryRuleUpdate,
} from './category-rule-response.mapper';

@Controller('users/me/category-rules')
@ApiTags('Category rules')
@ApiExtraModels(
  CategoryRuleResponseDto,
  CreateCategoryRuleDto,
  UpdateCategoryRuleDto,
)
export class CategoryRulesController {
  constructor(
    private readonly categoryRulesService: CategoryRulesService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a category rule.',
    description:
      'Matching normalizes surrounding and repeated whitespace and compares case-insensitively.',
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
          example: `/${API_PREFIX}/users/me/category-rules/42`,
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
    @Body() input: CreateCategoryRuleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalWriteSpace(userId);
    const rule = await this.categoryRulesService.createCategoryRuleInSpace(
      personalSpace.id,
      input,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', categoryRuleLocation(rule.id));
    return toCategoryRuleResponse(rule);
  }

  @Get()
  @ApiOperation({
    summary: 'List all owned category rules in ascending ID order.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category rules.',
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(CategoryRuleResponseDto) },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'InternalError',
  )
  async listCategoryRules(
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryRuleResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalReadSpace(userId);
    const rules = (
      await this.categoryRulesService.listCategoryRulesInSpace(personalSpace.id)
    ).rules;
    return rules.map(toCategoryRuleResponse);
  }

  @Get(':ruleId')
  @ApiOperation({ summary: 'Get a category rule.' })
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
    @Param() params: CategoryRuleParamsDto,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalReadSpace(userId);
    return toCategoryRuleResponse(
      await this.categoryRulesService.getCategoryRuleInSpace(
        personalSpace.id,
        params.ruleId,
      ),
    );
  }

  @Patch(':ruleId')
  @ApiOperation({
    summary: 'Update or reassign a category rule.',
    description:
      'A category rule may be reassigned only to an active Category; assigning it to an inactive Category returns 409 Conflict.',
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
    @Param() params: CategoryRuleParamsDto,
    @Body() input: UpdateCategoryRuleDto,
  ): Promise<CategoryRuleResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalWriteSpace(userId);
    return toCategoryRuleResponse(
      await this.categoryRulesService.updateCategoryRuleInSpace(
        personalSpace.id,
        params.ruleId,
        toCategoryRuleUpdate(input),
      ),
    );
  }

  @Delete(':ruleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category rule.' })
  @ApiHeader({
    name: 'if-match',
    required: false,
    description:
      'Optional Category Rule updatedAt timestamp. The delete is rejected when it is stale.',
    schema: { type: 'string', format: 'date-time' },
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
    @Param() params: CategoryRuleParamsDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    const userId = requireAuthenticatedUserId(request);
    const personalSpace = await this.requirePersonalWriteSpace(userId);
    await this.categoryRulesService.deleteCategoryRuleInSpace(
      personalSpace.id,
      params.ruleId,
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

function categoryRuleLocation(ruleId: string): string {
  return `/${API_PREFIX}/users/me/category-rules/${ruleId}`;
}
