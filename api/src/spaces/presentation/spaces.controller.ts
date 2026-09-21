import { Controller, Get, HttpStatus, Param, Req } from '@nestjs/common';
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
import { SpaceAccessService } from '../application/space-access.service';
import type { AccessibleSpaceRecord } from '../application/space-store';
import { SpaceParamsDto } from './space.dto';
import { SpaceMemberResponseDto, SpaceResponseDto } from './space-response.dto';

@Controller('users/me/spaces')
@ApiTags('Spaces')
@ApiExtraModels(SpaceMemberResponseDto, SpaceResponseDto, SpaceParamsDto)
export class SpacesController {
  constructor(private readonly spaceAccessService: SpaceAccessService) {}

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
}

export function toSpaceResponse(
  space: AccessibleSpaceRecord,
): SpaceResponseDto {
  return {
    id: space.id,
    kind: space.kind,
    status: space.status,
    accessLevel: space.accessLevel,
    members: space.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };
}
