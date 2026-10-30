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
import { AccountDeletionService } from '../application/account-deletion.service';
import { DeletionResponseDto } from './deletion-response.dto';

@Controller('users/me')
@ApiTags('Users')
@ApiExtraModels(UserResponseDto)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly deletion: AccountDeletionService,
  ) {}

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
    'UserNotProvisionedError',
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

  @Get('deletion')
  @ApiOperation({
    summary: 'Read deletion status using the initiating, live Clerk session.',
  })
  @ApiResponse({
    status: 200,
    type: DeletionResponseDto,
    headers: {
      'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'ServiceUnavailableError',
    'InternalError',
  )
  async deletionStatus(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeletionResponseDto> {
    response.setHeader('Cache-Control', 'no-store');
    return this.deletion.status(
      requireAuthenticatedClerkUserId(request),
      request.authenticatedSession!.sessionId,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Accept permanent account deletion and reconcile cleanup in the background.',
    description:
      'Acceptance durably fences access, scrubs identity and archives active Shared Spaces. Personal data, provider identity and sessions are reconciled without the app. Requires a live Clerk session. Only the initiating session can retry or read status.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description:
      'Every cleanup checkpoint is complete and the initiating credential remains valid.',
  })
  @ApiResponse({
    status: 202,
    type: DeletionResponseDto,
    description: 'Deletion accepted; cleanup is pending.',
    headers: {
      Location: {
        required: true,
        schema: { type: 'string', example: `/${API_PREFIX}/users/me/deletion` },
      },
    },
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'ServiceUnavailableError',
    'InternalError',
  )
  async deleteUser(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeletionResponseDto | void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.deletion.request(
      requireAuthenticatedClerkUserId(request),
      request.authenticatedSession!.sessionId,
    );
    if (result.status === 'completed') {
      response.status(204);
      return;
    }
    response.status(202);
    response.setHeader('Location', `/${API_PREFIX}/users/me/deletion`);
    return result;
  }
}

export function toUserResponse(user: UserRecord): UserResponseDto {
  return {
    photoUrl: user.photoUrl ?? null,
    deletionStatus: 'active',
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
