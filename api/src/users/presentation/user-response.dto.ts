import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import {
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '../application/user-store';

@ApiSchema({
  additionalProperties: false,
} as { name?: string; description?: string; additionalProperties?: boolean })
export class UserResponseDto {
  @ApiProperty({
    description: 'Positive bigint User identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  id!: string;

  @ApiProperty({
    description: 'Display name synchronized from the identity provider.',
    minLength: 1,
    maxLength: USER_NAME_MAX_LENGTH,
    pattern: '\\S',
    example: 'Ada Lovelace',
  })
  name!: string;

  @ApiProperty({
    description:
      'Primary verified email synchronized from the identity provider.',
    format: 'email',
    maxLength: USER_EMAIL_MAX_LENGTH,
    example: 'ada@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'UTC timestamp when the local User was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the local User was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}
