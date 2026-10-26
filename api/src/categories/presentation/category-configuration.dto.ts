import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  Length,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN } from '../../http/validation-patterns';
import { BUDGET_PERIODS, type BudgetPeriod } from '../application/budget-store';
import {
  CATEGORY_COLORS,
  type CategoryColor,
} from '../application/category-color';
import {
  CATEGORY_ICON_KEYS,
  type CategoryIconKey,
} from '../application/category-icon';
import { CATEGORY_NAME_MAX_LENGTH } from '../application/category-store';
import {
  CATEGORY_RULE_MATCH_TYPES,
  type CategoryRuleMatchType,
} from '../../category-rules/application/category-rule-store';
import { CATEGORY_RULE_PATTERN_MAX_LENGTH } from '../../category-rules/application/category-rule-store';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryConfigurationBudgetDto {
  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiProperty({
    description: 'Positive exact two-decimal Budget amount in PHP.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '250.00',
  })
  amount!: string;

  @IsIn(['PHP'])
  @ApiProperty({ enum: ['PHP'], example: 'PHP' })
  currency!: 'PHP';

  @IsIn(BUDGET_PERIODS)
  @ApiProperty({ enum: [...BUDGET_PERIODS], example: 'monthly' })
  recurrence!: BudgetPeriod;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryConfigurationRuleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, CATEGORY_RULE_PATTERN_MAX_LENGTH)
  @ApiProperty({ minLength: 1, maxLength: CATEGORY_RULE_PATTERN_MAX_LENGTH })
  pattern!: string;

  @IsIn(CATEGORY_RULE_MATCH_TYPES)
  @ApiProperty({ enum: [...CATEGORY_RULE_MATCH_TYPES] })
  matchType!: CategoryRuleMatchType;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategoryConfigurationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, CATEGORY_NAME_MAX_LENGTH)
  @ApiProperty({
    minLength: 1,
    maxLength: CATEGORY_NAME_MAX_LENGTH,
    example: 'Dining Out',
  })
  name!: string;

  @IsIn(CATEGORY_ICON_KEYS)
  @ApiProperty({ enum: [...CATEGORY_ICON_KEYS], example: 'utensils' })
  iconKey!: CategoryIconKey;

  @IsIn(CATEGORY_COLORS)
  @ApiProperty({ enum: [...CATEGORY_COLORS], example: 'teal' })
  colorKey!: CategoryColor;

  @IsBoolean()
  @ApiProperty({ example: true })
  isActive!: boolean;

  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CategoryConfigurationBudgetDto)
  @ApiProperty({
    type: () => CategoryConfigurationBudgetDto,
    nullable: true,
    description: 'Complete current Budget, or null to remove it.',
  })
  budget!: CategoryConfigurationBudgetDto | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryConfigurationRuleDto)
  @ApiProperty({ type: () => [CategoryConfigurationRuleDto] })
  rules!: CategoryConfigurationRuleDto[];

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d+$/u)
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Category revision from the last read; null is required when creating a Category.',
    pattern: '^\\d+$',
    example: '2',
  })
  expectedRevision!: string | null;

  @IsString()
  @Matches(/^\d+$/u)
  @ApiProperty({
    description:
      'Space Rule revision from the last read. It is checked when this draft changes the Rule set.',
    pattern: '^\\d+$',
    example: '3',
  })
  expectedRulesRevision!: string;
}
