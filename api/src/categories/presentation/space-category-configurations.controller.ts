import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Put,
  Req,
} from '@nestjs/common';
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
import { CategoryConfigurationsService } from '../application/category-configurations.service';
import { CategoryConfigurationDto } from './category-configuration.dto';
import { CategoryConfigurationResponseDto } from './category-configuration-response.dto';
import { toCategoryConfigurationResponse } from './category-configuration-response.mapper';
import { toCategoryConfigurationInput } from './category-configuration.mapper';
import { SpaceCategoryParamsDto } from './space-category.dto';

@Controller('users/me/spaces/:spaceId/categories/:categoryId/configuration')
@ApiTags('Categories')
@ApiExtraModels(CategoryConfigurationDto, CategoryConfigurationResponseDto)
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
export class SpaceCategoryConfigurationsController {
  constructor(
    private readonly configurationsService: CategoryConfigurationsService,
    private readonly spaceAccessService: SpaceAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get a complete Category configuration in an authorized Space.',
    description:
      'Returns the Category, its optional current Budget, its complete Rules, the Category revision, and the Space Rule revision from one consistent read.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Complete Category configuration.',
    type: CategoryConfigurationResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getCategoryConfiguration(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryParamsDto,
  ): Promise<CategoryConfigurationResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireReadAccess(userId, params.spaceId);
    return toCategoryConfigurationResponse(
      await this.configurationsService.getInSpace(
        params.spaceId,
        params.categoryId,
      ),
    );
  }

  @Put()
  @ApiOperation({
    summary: 'Save a complete Category configuration atomically.',
    description:
      'Replaces Category fields, its optional Budget, and its complete Rule set in one transaction. The Category revision is always checked; the Space Rule revision is checked when the Rule set changes. Inactive Categories remain configurable. Rule conflicts or stale revisions reject the entire command.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Complete Category configuration saved.',
    type: CategoryConfigurationResponseDto,
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
  async replaceCategoryConfiguration(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceCategoryParamsDto,
    @Body() input: CategoryConfigurationDto,
  ): Promise<CategoryConfigurationResponseDto> {
    const userId = requireAuthenticatedUserId(request);
    await this.spaceAccessService.requireWriteAccess(userId, params.spaceId);
    return toCategoryConfigurationResponse(
      await this.configurationsService.replaceInSpace(
        params.spaceId,
        params.categoryId,
        toCategoryConfigurationInput(input),
      ),
    );
  }
}
