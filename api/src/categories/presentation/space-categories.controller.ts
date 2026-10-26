import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
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
import { requireOptimisticVersion } from '../../http/optimistic-version';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { CategoriesService } from '../application/categories.service';
import { CategoryConfigurationsService } from '../application/category-configurations.service';
import type { UpdateCategory } from '../application/category-store';
import { UpdateCategoryDto } from './category.dto';
import { CategoryConfigurationDto } from './category-configuration.dto';
import { CategoryConfigurationResponseDto } from './category-configuration-response.dto';
import { toCategoryConfigurationResponse } from './category-configuration-response.mapper';
import { toCategoryConfigurationInput } from './category-configuration.mapper';
import { CategoryResponseDto } from './category-response.dto';
import { toSpaceCategoryResponse } from './category-response.mapper';
import { SpaceCategoryParamsDto } from './space-category.dto';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';

@Controller('users/me/spaces/:spaceId/categories')
@ApiTags('Categories')
@ApiExtraModels(
  CategoryResponseDto,
  CategoryConfigurationDto,
  CategoryConfigurationResponseDto,
  UpdateCategoryDto,
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
export class SpaceCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly configurationsService: CategoryConfigurationsService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a complete Category configuration in an authorized Space.',
    description:
      'Creates the Category, optional Budget, and complete Rule set in one transaction.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Category created.',
    type: CategoryConfigurationResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Category.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/spaces/7/categories/42/configuration`,
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
  async createCategory(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() input: CategoryConfigurationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryConfigurationResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const configuration = await this.configurationsService.createInSpace(
      params.spaceId,
      toCategoryConfigurationInput(input),
    );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      categoryConfigurationLocation(params.spaceId, configuration.category.id),
    );
    return toCategoryConfigurationResponse(configuration);
  }

  @Get()
  @ApiOperation({ summary: 'List Categories in an authorized Space.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Categories.',
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(CategoryResponseDto) },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async listCategories(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
  ): Promise<CategoryResponseDto[]> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    const categories = await this.categoriesService.listCategoriesInSpace(
      params.spaceId,
    );
    return categories.map(toSpaceCategoryResponse);
  }

  @Get(':categoryId')
  @ApiOperation({ summary: 'Get a Category in an authorized Space.' })
  @ApiParam({
    name: 'categoryId',
    description: 'Positive bigint Category identifier encoded as a string.',
    schema: {
      type: 'string',
      pattern: POSITIVE_INTEGER_ID_PATTERN.source,
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category.',
    type: CategoryResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getCategory(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryParamsDto,
  ): Promise<CategoryResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toSpaceCategoryResponse(
      await this.categoriesService.getCategoryInSpace(
        params.spaceId,
        params.categoryId,
      ),
    );
  }

  @Patch(':categoryId')
  @ApiOperation({
    summary: 'Edit or activate/deactivate a Category in an authorized Space.',
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category updated.',
    type: CategoryResponseDto,
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
  async updateCategory(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryParamsDto,
    @Body() input: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    return toSpaceCategoryResponse(
      await this.categoriesService.updateCategoryInSpace(
        params.spaceId,
        params.categoryId,
        toCategoryUpdate(input),
      ),
    );
  }
}

function toCategoryUpdate(input: UpdateCategoryDto): UpdateCategory {
  const { updatedAt, ...changes } = input;
  return {
    ...changes,
    expectedUpdatedAt: requireOptimisticVersion(
      updatedAt,
      'Category',
      '/updatedAt',
    ),
  };
}

export { toSpaceCategoryResponse } from './category-response.mapper';

function categoryConfigurationLocation(
  spaceId: string,
  categoryId: string,
): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/categories/${categoryId}/configuration`;
}
