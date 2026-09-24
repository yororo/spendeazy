import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString, Matches } from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import type { SpaceNotificationRecord } from '../application/space-notification';

export class ConfirmSpaceLeaveDto {
  @ApiProperty({
    description:
      'The member explicitly confirmed that both members lose editing access.',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}

export class SpaceNotificationParamsDto {
  @ApiProperty({ pattern: POSITIVE_INTEGER_ID_PATTERN.source, example: '42' })
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  notificationId!: string;
}

export class SpaceNotificationResponseDto {
  @ApiProperty({ pattern: POSITIVE_INTEGER_ID_PATTERN.source, example: '42' })
  id!: string;

  @ApiProperty({ pattern: POSITIVE_INTEGER_ID_PATTERN.source, example: '7' })
  spaceId!: string;

  @ApiProperty({
    enum: ['shared_space_archived'],
    example: 'shared_space_archived',
  })
  type!: SpaceNotificationRecord['type'];

  @ApiProperty({ example: 'Shared Space archived' })
  title!: string;

  @ApiProperty({ example: 'Ada ended sharing.' })
  message!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  readAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
