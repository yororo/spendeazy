import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import type { AccessibleSpaceRecord } from '../application/space-store';

@ApiSchema({
  additionalProperties: false,
} as { name?: string; description?: string; additionalProperties?: boolean })
export class SpaceMemberResponseDto {
  @ApiProperty({
    description: 'Positive bigint User identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  id!: string;

  @ApiProperty({
    description: 'Display name of a User in the Space.',
    minLength: 1,
    example: 'Ada Lovelace',
  })
  name!: string;
}

@ApiSchema({
  additionalProperties: false,
} as { name?: string; description?: string; additionalProperties?: boolean })
export class SpaceResponseDto {
  @ApiProperty({
    description: 'Positive bigint Space identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  id!: string;

  @ApiProperty({
    description: 'The kind of financial Space.',
    enum: ['personal', 'shared'],
    example: 'personal',
  })
  kind!: AccessibleSpaceRecord['kind'];

  @ApiProperty({
    description: 'The lifecycle state of the Space.',
    enum: ['active', 'archived'],
    example: 'active',
  })
  status!: AccessibleSpaceRecord['status'];

  @ApiProperty({
    description:
      "The authenticated User's membership access. Read access includes archived history; write access is required for mutations.",
    enum: ['read', 'write'],
    example: 'write',
  })
  accessLevel!: AccessibleSpaceRecord['accessLevel'];

  @ApiProperty({
    description:
      'Users whose membership identity may be displayed for this authorized Space.',
    type: [SpaceMemberResponseDto],
    minItems: 1,
  })
  members!: SpaceMemberResponseDto[];

  @ApiProperty({
    description: 'UTC timestamp when the Space was created.',
    format: 'date-time',
    example: '2026-09-20T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Space was last updated.',
    format: 'date-time',
    example: '2026-09-20T00:00:00.000Z',
  })
  updatedAt!: string;
}
