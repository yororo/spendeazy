import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateIf,
  IsIn,
  IsArray,
  IsObject,
  ValidateNested,
  IsISO8601,
} from 'class-validator';
import { POSITIVE_INTEGER_ID_PATTERN } from '../../http/validation-patterns';
import { requireAtLeastOneField } from '../../http/require-at-least-one-field';
import {
  CATEGORY_RULE_PATTERN_MAX_LENGTH,
  CATEGORY_RULE_MATCH_TYPES,
  type CategoryRuleMatchType,
} from '../application/category-rule-store';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
  minProperties?: number;
};

export class CategoryRuleParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  ruleId!: string;
}

export class SpaceCategoryRuleParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  spaceId!: string;

  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  ruleId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CreateCategoryRuleDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(CATEGORY_RULE_MATCH_TYPES)
  @ApiPropertyOptional({
    enum: CATEGORY_RULE_MATCH_TYPES,
    default: 'exact',
    description:
      'Omission creates an Exact rule, including frontend Remember requests.',
  })
  matchType?: CategoryRuleMatchType;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, CATEGORY_RULE_PATTERN_MAX_LENGTH)
  @ApiProperty({
    description:
      'Original rule text. Uniqueness trims surrounding whitespace, collapses repeated whitespace, and ignores case within each match type. Rule evaluation belongs to the frontend.',
    minLength: 1,
    maxLength: CATEGORY_RULE_PATTERN_MAX_LENGTH,
    pattern: '\\S',
    example: 'Green Market',
  })
  pattern!: string;

  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description:
      "Positive bigint Category identifier encoded as a decimal JSON string. The Category must be active in the destination Space; the legacy personal route resolves the authenticated User's Personal Space. An inactive Category causes a 409 Conflict.",
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId!: string;
}

@ApiSchema({
  additionalProperties: false,
  minProperties: 1,
} as ApiSchemaOptionsWithAdditionalProperties)
@requireAtLeastOneField(
  ['pattern', 'categoryId', 'matchType'],
  'At least one category rule field is required',
)
export class UpdateCategoryRuleDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(CATEGORY_RULE_MATCH_TYPES)
  @ApiPropertyOptional({
    enum: CATEGORY_RULE_MATCH_TYPES,
    description: 'Omission preserves the current match type.',
  })
  matchType?: CategoryRuleMatchType;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, CATEGORY_RULE_PATTERN_MAX_LENGTH)
  @ApiPropertyOptional({
    description:
      'Original rule text. Uniqueness trims surrounding whitespace, collapses repeated whitespace, and ignores case within each match type.',
    minLength: 1,
    maxLength: CATEGORY_RULE_PATTERN_MAX_LENGTH,
    pattern: '\\S',
    example: 'Green Market',
  })
  pattern?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive bigint Category identifier encoded as a decimal JSON string. Reassignment requires an active Category in the destination Space; an inactive Category causes a conflict.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsISO8601({ strict: true })
  @ApiPropertyOptional({
    description:
      'The UTC timestamp returned by the last read. A stale scoped edit is rejected when another member changed this rule first.',
    format: 'date-time',
    example: '2026-08-29T00:00:00.000Z',
  })
  updatedAt?: string;
}

export class CategoryRuleCategoryParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  categoryId!: string;
}

export class SpaceCategoryRuleCategoryParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  spaceId!: string;

  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  categoryId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ReplacementCategoryRuleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, CATEGORY_RULE_PATTERN_MAX_LENGTH)
  @ApiProperty({
    minLength: 1,
    maxLength: CATEGORY_RULE_PATTERN_MAX_LENGTH,
    pattern: '\\S',
  })
  pattern!: string;

  @IsIn(CATEGORY_RULE_MATCH_TYPES)
  @ApiProperty({ enum: CATEGORY_RULE_MATCH_TYPES })
  matchType!: CategoryRuleMatchType;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ReplaceCategoryRulesDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^\d+$/u)
  @ApiPropertyOptional({
    description:
      'The revision returned with the last Space-scoped rule collection. A stale replacement is rejected when another member changed any Rule first.',
    pattern: '^\\d+$',
    example: '3',
  })
  revision?: string;

  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ReplacementCategoryRuleDto)
  @ApiProperty({
    type: () => [ReplacementCategoryRuleDto],
    description:
      'Complete desired rule set. Empty removes all rules for this Category.',
  })
  rules!: ReplacementCategoryRuleDto[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class SpaceReplaceCategoryRulesDto {
  @IsString()
  @Matches(/^\d+$/u)
  @ApiProperty({
    description:
      'The revision returned with the last Space-scoped rule collection. A stale replacement is rejected when another member changed any Rule first.',
    pattern: '^\\d+$',
    example: '3',
  })
  revision!: string;

  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ReplacementCategoryRuleDto)
  @ApiProperty({
    type: () => [ReplacementCategoryRuleDto],
    description:
      'Complete desired rule set. Empty removes all rules for this Category.',
  })
  rules!: ReplacementCategoryRuleDto[];
}
