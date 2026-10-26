import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
} from '../application/category-store';
import {
  CATEGORY_COLORS,
  type CategoryColor,
} from '../application/category-color';
import {
  CATEGORY_ICON_KEYS,
  type CategoryIconKey,
} from '../application/category-icon';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A Category in the authorized Space. Inactive Categories retain their historical relationships.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryResponseDto {
  @ApiProperty({
    description: 'Positive bigint Category identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  id!: string;

  @ApiProperty({
    description:
      'Trimmed Category display name. Uniqueness is checked case-insensitively.',
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
    pattern: '\\S',
    example: 'Dining Out',
  })
  name!: string;

  @ApiProperty({
    type: String,
    description:
      'Trimmed Category description, or null when no description is set.',
    nullable: true,
    maxLength: CATEGORY_DESCRIPTION_MAX_LENGTH,
    example: 'Restaurants and cafes',
  })
  description!: string | null;

  @ApiProperty({
    enum: [...CATEGORY_ICON_KEYS],
    description: 'Icon key from the shared Category icon catalog.',
    example: 'utensils',
  })
  iconKey!: CategoryIconKey;

  @ApiProperty({
    enum: [...CATEGORY_COLORS],
    description:
      'Effective Category Color palette identifier. An explicitly saved choice is returned as-is; Categories without a saved choice receive a stable identity-based default.',
    example: 'teal',
  })
  colorKey!: CategoryColor;

  @ApiProperty({
    description:
      'Whether the Category is active. Inactive Categories retain their history and remain available through the aggregate configuration endpoint.',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description:
      'Monotonic Category configuration revision. It advances once for each changed Category, Budget, or Rule aggregate save.',
    pattern: '^\\d+$',
    example: '3',
  })
  revision!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Category was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Category was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}
