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
  ConfirmInvitationDeclineDto,
  CreateInvitationDto,
  InvitationInboxResponseDto,
  InvitationParamsDto,
  InvitationResponseDto,
} from './invitation.dto';

@Controller('users/me/invitations')
@ApiTags('Invitations')
@ApiBearerAuth('bearerAuth')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'List outgoing and incoming invitations.' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationInboxResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ServiceUnavailableError',
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
    summary: 'Create and deliver one outgoing invitation.',
    description:
      'The response is intentionally the same for registered and unregistered recipient addresses. A delivery failure is represented on the returned invitation and can be retried.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: InvitationResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'ConflictError',
    'InternalError',
  )
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.create(
      requireAuthenticatedUserId(request),
      body.email,
    );
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending outgoing invitation.' })
  @ApiParam({ name: 'invitationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Canceled.' })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationParamsDto,
  ): Promise<void> {
    await this.invitationsService.cancel(
      requireAuthenticatedUserId(request),
      params.invitationId,
    );
  }

  @Post(':invitationId/resend')
  @ApiOperation({ summary: 'Resend a pending invitation email.' })
  @ApiParam({ name: 'invitationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  resend(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationParamsDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.resend(
      requireAuthenticatedUserId(request),
      params.invitationId,
    );
  }

  @Post(':invitationId/retry')
  @ApiOperation({ summary: 'Retry a failed invitation email delivery.' })
  @ApiParam({ name: 'invitationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  retry(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationParamsDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.resend(
      requireAuthenticatedUserId(request),
      params.invitationId,
    );
  }

  @Post(':invitationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Decline an incoming invitation.' })
  @ApiParam({ name: 'invitationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Declined.' })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ValidationError',
    'ServiceUnavailableError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  async decline(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationParamsDto,
    @Body() body: ConfirmInvitationDeclineDto,
  ): Promise<void> {
    if (!body.confirm) return;
    await this.invitationsService.declineForUser(
      requireAuthenticatedUserId(request),
      params.invitationId,
    );
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept an incoming invitation and create a Shared Space.',
    description:
      'Acceptance requires the authenticated User to own the invited email in a verified identity-provider email address. The response is the newly authorized Shared Space; the public invitation token cannot be used for acceptance.',
  })
  @ApiParam({ name: 'invitationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.OK, type: SpaceResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'ServiceUnavailableError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  async accept(
    @Req() request: AuthenticatedRequest,
    @Param() params: InvitationParamsDto,
  ): Promise<SpaceResponseDto> {
    return toSpaceResponse(
      await this.invitationsService.acceptForUser(
        requireAuthenticatedUserId(request),
        params.invitationId,
      ),
    );
  }
}
