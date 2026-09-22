import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Optional,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { toSpaceResponse } from '../../http/space-response.mapper';
import {
  SpaceMemberResponseDto,
  SpaceResponseDto,
} from '../../http/space-response.dto';
import { SpaceAccessService } from '../application/space-access.service';
import { SpaceLifecycleService } from '../application/space-lifecycle.service';
import { SpaceParamsDto } from './space.dto';
import { ConfirmSpaceLeaveDto } from './space-notification.dto';

@Controller('users/me/spaces')
@ApiTags('Spaces')
@ApiExtraModels(SpaceMemberResponseDto, SpaceResponseDto, SpaceParamsDto)
export class SpacesController {
  constructor(
    private readonly spaceAccessService: SpaceAccessService,
    @Optional()
    private readonly spaceLifecycleService?: SpaceLifecycleService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List Spaces accessible to the authenticated User.',
    description:
      'The authenticated session determines the User. Client-supplied User identifiers are ignored, and all authorized memberships with read access are returned, including archived Shared Space history. Each Space includes the member identity needed for an explicit switcher or history label.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Accessible Spaces.',
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(SpaceResponseDto) },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'InternalError',
  )
  async listSpaces(
    @Req() request: AuthenticatedRequest,
  ): Promise<SpaceResponseDto[]> {
    const spaces = await this.spaceAccessService.listAccessibleSpaces(
      requireAuthenticatedUserId(request),
    );
    return spaces.map(toSpaceResponse);
  }

  @Get(':spaceId')
  @ApiOperation({
    summary: 'Get an accessible Space.',
    description:
      'A client-supplied Space identifier is accepted only after the authenticated User has read membership in that Space.',
  })
  @ApiParam({
    name: 'spaceId',
    description: 'Positive bigint identifier encoded as a decimal JSON string.',
    schema: {
      type: 'string',
      pattern: '^[1-9]\\d*$',
      example: '42',
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Accessible Space.',
    type: SpaceResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getSpace(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
  ): Promise<SpaceResponseDto> {
    return toSpaceResponse(
      await this.spaceAccessService.requireReadAccess(
        requireAuthenticatedUserId(request),
        params.spaceId,
      ),
    );
  }

  @Post(':spaceId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End sharing and permanently archive a Shared Space.',
    description:
      'After explicit confirmation, the active Shared Space becomes permanent read-only history for both former members. Earlier completed financial writes remain; later writes are rejected. Archives cannot be reopened.',
  })
  @ApiParam({
    name: 'spaceId',
    description: 'Positive bigint identifier encoded as a decimal string.',
    schema: { type: 'string', pattern: '^[1-9]\\d*$', example: '42' },
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Space archived.',
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async leaveSpace(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceParamsDto,
    @Body() _input: ConfirmSpaceLeaveDto,
  ): Promise<void> {
    void _input;
    if (!this.spaceLifecycleService) {
      throw new Error('Space lifecycle is not configured');
    }
    await this.spaceLifecycleService.leaveSharedSpace(
      requireAuthenticatedUserId(request),
      params.spaceId,
    );
  }
}
