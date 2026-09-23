import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';

const INVITATION_ID_PATTERN = '^[1-9]\\d*$';
const INVITATION_CODE_PATTERN =
  '^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){5}$';

export class CreateInvitationDto {}

export class ClaimInvitationDto {
  @ApiProperty({
    description:
      'The Invite Code entered by the authenticated User. Case and grouping separators are normalized by the API.',
    example: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  code!: string;
}

export class InvitationClaimParamsDto {
  @ApiProperty({ pattern: INVITATION_ID_PATTERN, example: '88' })
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  claimId!: string;
}

export class OutgoingInvitationResponseDto {
  @ApiProperty({ pattern: INVITATION_ID_PATTERN, example: '42' })
  id!: string;

  @ApiProperty({
    description:
      'The sender-only Invite Code. It is grouped for human entry and is never placed in a URL.',
    pattern: INVITATION_CODE_PATTERN,
    example: '7K3M-2Q8R-5T6V-W9X2-C4D7-H8J3',
  })
  code!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  status!: 'pending' | 'accepted' | 'revoked' | 'expired';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class IncomingInvitationResponseDto {
  @ApiProperty({ pattern: INVITATION_ID_PATTERN, example: '42' })
  id!: string;

  @ApiProperty({ description: 'Display name of the inviter.' })
  senderName!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  status!: 'pending' | 'accepted' | 'revoked' | 'expired';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class InvitationInboxResponseDto {
  @ApiProperty({ type: () => OutgoingInvitationResponseDto, nullable: true })
  outgoing!: OutgoingInvitationResponseDto | null;

  @ApiProperty({ type: () => IncomingInvitationResponseDto, isArray: true })
  incoming!: IncomingInvitationResponseDto[];
}
