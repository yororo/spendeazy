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

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A Category owned by the authenticated User. Inactive Categories retain their historical relationships.',
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
    enum: [...CATEGORY_COLORS],
    description:
      'Effective Category Color palette identifier. An explicitly saved choice is returned as-is; Categories without a saved choice receive a stable identity-based default.',
    example: 'teal',
  })
  color!: CategoryColor;

  @ApiProperty({
    description:
      'Whether the Category is active. Inactive Categories retain their historical relationships and cannot receive a new Budget, although an existing Budget may still be replaced.',
    example: true,
  })
  isActive!: boolean;

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
