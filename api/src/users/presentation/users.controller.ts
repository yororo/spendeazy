import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../config/app-config';
import {
  requireAuthenticatedClerkUserId,
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { UsersService } from '../application/users.service';
import type { UserRecord } from '../application/user-store';
import { UserResponseDto } from './user-response.dto';

@Controller('users/me')
@ApiTags('Users')
@ApiExtraModels(UserResponseDto)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put()
  @ApiOperation({
    summary:
      'Provision or synchronize my User profile. The request body is ignored.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User synchronized.',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User provisioned.',
    type: UserResponseDto,
    headers: {
      Location: {
        required: true,
        description: 'Relative canonical URI of the created User.',
        schema: { type: 'string', example: `/${API_PREFIX}/users/me` },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'ServiceUnavailableError',
    'NotAcceptableError',
    'InternalError',
  )
  async provisionUser(
    @Req() request: AuthenticatedRequest,
    @Body() _input: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponseDto> {
    const result = await this.usersService.provisionUser(
      requireAuthenticatedClerkUserId(request),
    );
    if (result.created) {
      response.status(HttpStatus.CREATED);
      response.setHeader('Location', userLocation());
    }

    return toUserResponse(result.user);
  }

  @Get()
  @ApiOperation({ summary: 'Get my User profile.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User.',
    type: UserResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'NotAcceptableError',
    'InternalError',
  )
  async getUser(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return toUserResponse(
      await this.usersService.getUserById(requireAuthenticatedUserId(request)),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete the local identity and archive any active Shared Space history.',
    description:
      'The local User is retained as a Deleted user tombstone so immutable financial attribution remains readable. Active Shared Spaces become permanent read-only history for the remaining member.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Identity access removed.',
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'InternalError',
  )
  async deleteUser(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.usersService.deleteByClerkUserId(
      requireAuthenticatedClerkUserId(request),
    );
  }
}

export function toUserResponse(user: UserRecord): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function userLocation(): string {
  return `/${API_PREFIX}/users/me`;
}
