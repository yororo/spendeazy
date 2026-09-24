import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
import { toSpaceResponse } from '../../http/space-response.mapper';
import { SpaceResponseDto } from '../../http/space-response.dto';
import { InvitationsService } from '../application/invitations.service';
import {
  CreateInvitationDto,
  ClaimInvitationDto,
  InvitationClaimParamsDto,
  InvitationInboxResponseDto,
  IncomingInvitationResponseDto,
  OutgoingInvitationResponseDto,
} from './invitation.dto';

@Controller('users/me/invitations')
@ApiTags('Invitations')
@ApiBearerAuth('bearerAuth')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @ApiOperation({
    summary: "Get the authenticated User's Shared Space invitations.",
    description:
      'Only the authenticated sender can receive their outgoing Invite Code. Incoming invitation claims are returned without exposing any sender code.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationInboxResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'InternalError',
  )
  list(
    @Req() request: AuthenticatedRequest,
  ): Promise<InvitationInboxResponseDto> {
    return this.invitationsService.listForUser(
      requireAuthenticatedUserId(request),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create one Shared Space Invite Code.',
    description:
      'Creates a sender-owned seven-day Invite Code without a recipient email. The authenticated sender may retrieve the same code from later list requests. The code is returned only in this sender-scoped response and is never included in a URL.',
  })
  @ApiBody({ type: CreateInvitationDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: OutgoingInvitationResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'ConflictError',
    'ValidationError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  create(
    @Req() request: AuthenticatedRequest,
  ): Promise<OutgoingInvitationResponseDto> {
    return this.invitationsService.createForUser(
      requireAuthenticatedUserId(request),
    );
  }

  @Post('claims')
  @ApiOperation({
    summary: 'Save a Shared Space invitation by Invite Code.',
    description:
      'Validates the entered Invite Code for the authenticated User and saves a personal incoming invitation claim. This operation never creates membership. Unavailable codes use one generic response.',
  })
  @ApiBody({ type: ClaimInvitationDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: IncomingInvitationResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'ValidationError',
    'NotFoundError',
    'RateLimitError',
    'UnsupportedMediaTypeError',
    'HttpError',
    'InternalError',
  )
  claim(
    @Req() request: AuthenticatedRequest,
    @Body() input: ClaimInvitationDto,
  ): Promise<IncomingInvitationResponseDto> {
    return this.invitationsService.claimForUser(
      requireAuthenticatedUserId(request),
      input.code,
      request.ip || request.socket.remoteAddress || 'unknown',
    );
  }

  @Delete('claims/:claimId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Decline a saved Shared Space invitation.',
    description:
      'Removes only the authenticated User’s saved invitation claim. The sender’s Invite Code and other Users’ claims remain available.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotAcceptableError',
    'ValidationError',
    'NotFoundError',
    'InternalError',
  )
  async decline(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationClaimParamsDto,
  ): Promise<void> {
    await this.invitationsService.declineForUser(
      requireAuthenticatedUserId(request),
      params.claimId,
    );
  }

  @Post('claims/:claimId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join a Shared Space from a saved invitation.',
    description:
      'The authenticated User explicitly accepts their saved invitation. The API rechecks both Users’ eligibility, creates one active Shared Space with equal write membership and default Categories, consumes the Invite Code, and invalidates competing invitations.',
  })
  @ApiParam({
    name: 'claimId',
    description: 'Saved invitation claim identifier.',
    schema: { type: 'string', pattern: '^[1-9]\\d*$', example: '88' },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The newly joined Shared Space.',
    type: SpaceResponseDto,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  async accept(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationClaimParamsDto,
  ): Promise<SpaceResponseDto> {
    return toSpaceResponse(
      await this.invitationsService.acceptForUser(
        requireAuthenticatedUserId(request),
        params.claimId,
      ),
    );
  }
}
