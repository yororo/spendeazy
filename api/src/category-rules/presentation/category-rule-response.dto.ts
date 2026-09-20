import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import {
  CATEGORY_RULE_PATTERN_MAX_LENGTH,
  EXACT_CATEGORY_RULE_MATCH_TYPE,
  CATEGORY_RULE_MATCH_TYPES,
  type CategoryRuleMatchType,
} from '../application/category-rule-store';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  description:
    'A Category Rule belonging to the authorized Space. The original pattern is retained for display. Rule evaluation is performed by the frontend.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryRuleResponseDto {
  @ApiProperty({
    description:
      'Positive bigint Category rule identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  id!: string;

  @ApiProperty({
    description: 'Positive bigint Category identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId!: string;

  @ApiProperty({
    description:
      'Original rule text containing at least one non-whitespace character. Matching trims surrounding whitespace, collapses repeated whitespace, and compares case-insensitively.',
    minLength: 1,
    maxLength: CATEGORY_RULE_PATTERN_MAX_LENGTH,
    pattern: '\\S',
    example: 'Green   Market',
  })
  pattern!: string;

  @ApiProperty({
    description:
      'Exact or Contains matching. The normalized pattern is not returned.',
    enum: CATEGORY_RULE_MATCH_TYPES,
    example: EXACT_CATEGORY_RULE_MATCH_TYPE,
  })
  matchType!: CategoryRuleMatchType;

  @ApiProperty({
    description: 'UTC timestamp when the Category rule was created.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'UTC timestamp when the Category rule was last updated.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt!: string;
}

@ApiSchema({
  description:
    'Category Rules in an authorized Space. The revision covers the complete collection, including an empty collection.',
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryRuleCollectionResponseDto {
  @ApiProperty({
    type: () => [CategoryRuleResponseDto],
    description: 'Rules in ascending ID order.',
  })
  rules!: CategoryRuleResponseDto[];

  @ApiProperty({
    description:
      'Monotonic Space-scoped revision for stale replacement detection, encoded as a decimal string.',
    pattern: '^\\d+$',
    example: '3',
  })
  revision!: string;
}
