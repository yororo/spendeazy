import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
  IsIn,
  IsString,
  Matches,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { type BudgetPeriod } from '../application/budget-store';
import {
  isValidSummaryPeriodFields,
  SUMMARY_MONTH_PATTERN,
  SUMMARY_PERIODS,
  SUMMARY_YEAR_PATTERN,
} from '../application/category-summary-input';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ValidatorConstraint({ name: 'categorySummaryPeriodFields', async: false })
class CategorySummaryPeriodFieldsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments): boolean {
    return isValidSummaryPeriodFields(
      args?.object as { period?: unknown; month?: unknown },
    );
  }

  defaultMessage(): string {
    return 'Monthly summaries require month 01 through 12 and yearly summaries do not accept month';
  }
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CategorySummaryQueryDto {
  @IsString()
  @IsIn(SUMMARY_PERIODS)
  @Validate(CategorySummaryPeriodFieldsConstraint)
  @ApiProperty({
    description:
      'Calendar period. Monthly summaries require month and yearly summaries do not accept month.',
    enum: [...SUMMARY_PERIODS],
    example: 'monthly',
  })
  period!: BudgetPeriod;

  @IsString()
  @Matches(SUMMARY_YEAR_PATTERN)
  @ApiProperty({
    description: 'Four-digit calendar year used for the summary.',
    type: String,
    pattern: SUMMARY_YEAR_PATTERN.source,
    example: '2026',
  })
  year!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(SUMMARY_MONTH_PATTERN)
  @ApiPropertyOptional({
    description:
      'Required for monthly summaries; forbidden for yearly summaries.',
    type: String,
    pattern: SUMMARY_MONTH_PATTERN.source,
    example: '08',
  })
  month?: string;
}
