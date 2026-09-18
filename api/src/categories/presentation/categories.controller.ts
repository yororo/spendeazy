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
import { CategoriesService } from '../application/categories.service';
import type { CategoryRecord } from '../application/category-store';
import { resolveCategoryColor } from '../application/category-color';
import {
  CategoryParamsDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './category.dto';
import { CategoryResponseDto } from './category-response.dto';

@Controller('users/me/categories')
@ApiTags('Categories')
@ApiExtraModels(CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a category.',
    description:
      'Category names are trimmed before storage and uniqueness checking; uniqueness is case-insensitive.',
  })
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
          example: `/${API_PREFIX}/users/me/categories/42`,
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
    @Body() input: CreateCategoryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CategoryResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    const category = await this.categoriesService.createCategory(userId, input);
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', categoryLocation(category.id));
    return toCategoryResponse(category);
  }

  @Get()
  @ApiOperation({ summary: 'List all owned categories in ascending ID order.' })
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
    'NotAcceptableError',
    'InternalError',
  )
  async listCategories(
    @Req() request: AuthenticatedRequest,
  ): Promise<CategoryResponseDto[]> {
    const categories = await this.categoriesService.listCategories(
      requireAuthenticatedUserId(request),
    );
    return categories.map(toCategoryResponse);
  }

  @Get(':categoryId')
  @ApiOperation({ summary: 'Get a category.' })
  @ApiParam({
    name: 'categoryId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
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
    @Param() params: CategoryParamsDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(
      await this.categoriesService.getCategory(
        requireAuthenticatedUserId(request),
        params.categoryId,
      ),
    );
  }

  @Patch(':categoryId')
  @ApiOperation({
    summary: 'Edit or activate/deactivate a category.',
    description:
      'Inactive Categories retain their historical relationships and cannot receive a new Budget, although an existing Budget may still be replaced.',
  })
  @ApiParam({
    name: 'categoryId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
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
    @Param() params: CategoryParamsDto,
    @Body() input: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(
      await this.categoriesService.updateCategory(
        requireAuthenticatedUserId(request),
        params.categoryId,
        input,
      ),
    );
  }
}

export function toCategoryResponse(
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

function categoryLocation(categoryId: string): string {
  return `/${API_PREFIX}/users/me/categories/${categoryId}`;
}
