import { Controller, Get, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  requireAuthenticatedUserId,
  type AuthenticatedRequest,
} from '../../authentication/authentication';
import { ApiStandardErrorResponses } from '../../http/api-error.dto';
import { SpaceNotificationsService } from '../application/space-notifications.service';
import {
  SpaceNotificationParamsDto,
  SpaceNotificationResponseDto,
} from './space-notification.dto';
import type { SpaceNotificationRecord } from '../application/space-notification';

@Controller('users/me/notifications')
@ApiTags('Notifications')
export class SpaceNotificationsController {
  constructor(
    private readonly spaceNotificationsService: SpaceNotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications for the User.' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SpaceNotificationResponseDto,
    isArray: true,
  })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'InternalError',
  )
  async listNotifications(
    @Req() request: AuthenticatedRequest,
  ): Promise<SpaceNotificationResponseDto[]> {
    const notifications = await this.spaceNotificationsService.listForUser(
      requireAuthenticatedUserId(request),
    );
    return notifications.map(toSpaceNotificationResponse);
  }

  @Post(':notificationId/retry')
  @ApiOperation({ summary: 'Retry a failed archive notification email.' })
  @ApiParam({ name: 'notificationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.OK, type: SpaceNotificationResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'InternalError',
  )
  async retryNotification(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceNotificationParamsDto,
  ): Promise<SpaceNotificationResponseDto> {
    return toSpaceNotificationResponse(
      await this.spaceNotificationsService.retryForUser(
        requireAuthenticatedUserId(request),
        params.notificationId,
      ),
    );
  }

  @Post(':notificationId/read')
  @ApiOperation({ summary: 'Mark an in-app notification as read.' })
  @ApiParam({ name: 'notificationId', type: String, example: '42' })
  @ApiResponse({ status: HttpStatus.OK, type: SpaceNotificationResponseDto })
  @ApiStandardErrorResponses(
    'UnauthenticatedError',
    'UserNotProvisionedError',
    'NotFoundError',
    'InternalError',
  )
  async markNotificationRead(
    @Req() request: AuthenticatedRequest,
    @Param() params: SpaceNotificationParamsDto,
  ): Promise<SpaceNotificationResponseDto> {
    return toSpaceNotificationResponse(
      await this.spaceNotificationsService.markRead(
        requireAuthenticatedUserId(request),
        params.notificationId,
        new Date(),
      ),
    );
  }
}

function toSpaceNotificationResponse(
  notification: SpaceNotificationRecord,
): SpaceNotificationResponseDto {
  return {
    id: notification.id,
    spaceId: notification.spaceId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    readAt: notification.readAt?.toISOString() ?? null,
    emailDeliveryStatus: notification.emailDeliveryStatus,
    emailDeliveryError: notification.emailDeliveryError,
    createdAt: notification.createdAt.toISOString(),
  };
}
