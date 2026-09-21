import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { InvitationsService } from '../application/invitations.service';
import {
  ConfirmInvitationDeclineDto,
  InvitationTokenParamsDto,
  PublicInvitationResponseDto,
} from './invitation.dto';

@Controller('invitations')
@ApiTags('Invitations')
export class PublicInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Preview a limited invitation landing page payload.',
    description:
      'Previewing a link never accepts, declines, or otherwise changes the invitation.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PublicInvitationResponseDto })
  @ApiStandardErrorResponses('NotFoundError', 'ConflictError', 'InternalError')
  get(
    @Param() params: InvitationTokenParamsDto,
  ): Promise<PublicInvitationResponseDto> {
    return this.invitationsService.getPublic(params.token);
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirm decline of an invitation without registration.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Declined.' })
  @ApiStandardErrorResponses(
    'ValidationError',
    'NotFoundError',
    'ConflictError',
    'InternalError',
  )
  async decline(
    @Param() params: InvitationTokenParamsDto,
    @Body() body: ConfirmInvitationDeclineDto,
  ): Promise<void> {
    if (!body.confirm) return;
    await this.invitationsService.declinePublic(params.token);
  }
}
