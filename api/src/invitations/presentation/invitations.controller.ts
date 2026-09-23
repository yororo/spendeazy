import { Controller, Get, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { InvitationsService } from '../application/invitations.service';
import {
  CreateInvitationDto,
  InvitationInboxResponseDto,
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
}
