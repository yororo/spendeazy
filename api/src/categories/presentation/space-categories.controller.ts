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
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { SpaceAccessService } from '../../spaces/application/space-access.service';
import { CategoriesService } from '../application/categories.service';
import type {
  CategoryRecord,
  UpdateCategory,
} from '../application/category-store';
import { resolveCategoryColor } from '../application/category-color';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';
import { CategoryResponseDto } from './category-response.dto';
import { SpaceCategoryParamsDto } from './space-category.dto';
import { SpaceParamsDto } from '../../spaces/presentation/space.dto';

@Controller('users/me/spaces/:spaceId/categories')
@ApiTags('Categories')
@ApiExtraModels(CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto)
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
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a Category in an authorized Space.' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Category created.',
    type: CategoryResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created Category.',
        schema: {
          type: 'string',
          example: `/${API_PREFIX}/users/me/spaces/7/categories/42`,
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
    @Body() input: CreateCategoryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    const category = await this.categoriesService.createCategoryInSpace(
      userId,
      params.spaceId,
      input,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader(
      'Location',
      spaceCategoryLocation(params.spaceId, category.id),
    );
    return toSpaceCategoryResponse(category);
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
    ...(updatedAt === undefined ? {} : { expectedUpdatedAt: updatedAt }),
  };
}

export function toSpaceCategoryResponse(
  category: CategoryRecord,
): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    color: resolveCategoryColor(category.id, category.color),
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function spaceCategoryLocation(spaceId: string, categoryId: string): string {
  return `/${API_PREFIX}/users/me/spaces/${spaceId}/categories/${categoryId}`;
}
