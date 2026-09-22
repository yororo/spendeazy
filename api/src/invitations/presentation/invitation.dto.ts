import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

export class CreateInvitationDto {
  @ApiProperty({
    description: 'Email address that should receive the invitation.',
    format: 'email',
    maxLength: 320,
    example: 'partner@example.com',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ConfirmInvitationDeclineDto {
  @ApiProperty({
    description:
      'The user explicitly confirmed that the invitation is declined.',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}

export class InvitationParamsDto {
  @ApiProperty({
    description: 'Invitation identifier encoded as a decimal JSON string.',
    pattern: '^[1-9]\\d*$',
    example: '42',
  })
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  invitationId!: string;
}

export class InvitationTokenParamsDto {
  @ApiProperty({
    description: 'Opaque invitation link token.',
    pattern: '^[A-Za-z0-9_-]{32,128}$',
    example: '2xYQ5S1X4i4mFv8vJtTq4Yf4g5K0c4z3k1M7f8p2q6A',
  })
  @IsString()
  @Matches(INVITATION_TOKEN_PATTERN)
  token!: string;
}

export class InvitationResponseDto {
  @ApiProperty({ pattern: '^[1-9]\\d*$', example: '42' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'partner@example.com' })
  recipientEmail!: string;

  @ApiProperty({
    enum: ['pending', 'accepted', 'canceled', 'declined', 'expired'],
  })
  status!: 'pending' | 'accepted' | 'canceled' | 'declined' | 'expired';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastSentAt!: string | null;

  @ApiProperty({ enum: ['pending', 'sent', 'failed'] })
  deliveryStatus!: 'pending' | 'sent' | 'failed';

  @ApiPropertyOptional({ type: String, nullable: true })
  deliveryError!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ description: 'Display name of the inviter.' })
  senderName?: string;
}

export class InvitationInboxResponseDto {
  @ApiProperty({ type: () => InvitationResponseDto, nullable: true })
  outgoing!: InvitationResponseDto | null;

  @ApiProperty({ type: () => InvitationResponseDto, isArray: true })
  incoming!: InvitationResponseDto[];
}

export class PublicInvitationResponseDto {
  @ApiProperty({ pattern: '^[1-9]\\d*$', example: '42' })
  id!: string;

  @ApiProperty({ description: 'Display name of the inviter.' })
  senderName!: string;

  @ApiProperty({ format: 'email', example: 'partner@example.com' })
  recipientEmail!: string;

  @ApiProperty({
    enum: ['pending', 'accepted', 'canceled', 'declined', 'expired'],
  })
  status!: 'pending' | 'accepted' | 'canceled' | 'declined' | 'expired';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ example: true })
  canDecline!: boolean;
}
