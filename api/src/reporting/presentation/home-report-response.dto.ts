import { ApiProperty, ApiSchema } from '@nestjs/swagger';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeExactValueDto {
  @ApiProperty({ type: String, example: '25' })
  numerator!: string;

  @ApiProperty({ type: String, example: '6' })
  denominator!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeValueWithExactDto {
  @ApiProperty({ type: HomeExactValueDto })
  exact!: HomeExactValueDto;

  @ApiProperty({ type: String, example: '4.2' })
  amount!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeExpenseFilterDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-01-01' })
  fromDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-06-30' })
  toDate!: string;

  @ApiProperty({ type: String, required: false, example: '42' })
  categoryId?: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeDateFilterDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-01-01' })
  fromDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-06-30' })
  toDate!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeBudgetContextDto {
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  period!: 'monthly' | 'yearly';

  @ApiProperty({ type: String, example: '1200.00' })
  amount!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeRangeDto {
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  view!: 'monthly' | 'yearly';
  @ApiProperty({ type: String, format: 'date' })
  fromDate!: string;
  @ApiProperty({ type: String, format: 'date' })
  toDate!: string;
  @ApiProperty({ type: String, format: 'date' })
  today!: string;
  @ApiProperty({ type: String, example: 'Asia/Manila' })
  timezone!: 'Asia/Manila';
  @ApiProperty({ type: String, example: 'PHP' })
  currency!: 'PHP';
  @ApiProperty({ type: String, example: 'current' })
  configurationBasis!: 'current';
  @ApiProperty({ type: Boolean })
  inProgress!: boolean;
  @ApiProperty({ type: String, format: 'date-time' })
  asOf!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomePlanDto extends HomeValueWithExactDto {
  @ApiProperty({ type: Number, example: 6 })
  months!: number;
  @ApiProperty({ type: HomeValueWithExactDto })
  monthlyEquivalent!: HomeValueWithExactDto;
  @ApiProperty({ type: HomeValueWithExactDto })
  annualEquivalent!: HomeValueWithExactDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeHighestCategoryDto {
  @ApiProperty({ type: String })
  categoryId!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: String, example: '6400.00' })
  amount!: string;
  @ApiProperty({ type: HomeExpenseFilterDto })
  expenseFilter!: HomeExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeImportSummaryDto {
  @ApiProperty({ type: String, example: '2' })
  count!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  latestConfirmedAt!: string | null;
  @ApiProperty({ type: HomeDateFilterDto })
  filter!: HomeDateFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeComparisonDto {
  @ApiProperty({ enum: ['above_plan', 'below_plan', 'equal_plan', 'no_plan'] })
  direction!: 'above_plan' | 'below_plan' | 'equal_plan' | 'no_plan';
  @ApiProperty({ type: HomeValueWithExactDto })
  difference!: HomeValueWithExactDto;
  @ApiProperty({ type: HomeValueWithExactDto, nullable: true })
  percentage!: HomeValueWithExactDto | null;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeSummaryDto {
  @ApiProperty({ type: String, example: '12500.00' })
  actualAmount!: string;
  @ApiProperty({ type: String, example: '11' })
  expenseCount!: string;
  @ApiProperty({ type: HomePlanDto })
  planned!: HomePlanDto;
  @ApiProperty({ type: HomeComparisonDto })
  comparison!: HomeComparisonDto;
  @ApiProperty({ type: HomeHighestCategoryDto, nullable: true })
  highestCategory!: HomeHighestCategoryDto | null;
  @ApiProperty({ type: HomeImportSummaryDto })
  statementImports!: HomeImportSummaryDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeMonthlyExpenseDto {
  @ApiProperty({ type: String, example: '2026-06' })
  month!: string;
  @ApiProperty({ type: String, format: 'date' })
  fromDate!: string;
  @ApiProperty({ type: String, format: 'date' })
  toDate!: string;
  @ApiProperty({ type: Boolean })
  inProgress!: boolean;
  @ApiProperty({ type: String, example: '1039.99' })
  actualAmount!: string;
  @ApiProperty({ type: String, example: '1' })
  expenseCount!: string;
  @ApiProperty({ type: HomeExpenseFilterDto })
  expenseFilter!: HomeExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeCategoryMonthDto {
  @ApiProperty({ type: String })
  month!: string;
  @ApiProperty({ type: String })
  actualAmount!: string;
  @ApiProperty({ type: String })
  expenseCount!: string;
  @ApiProperty({
    enum: ['normal', 'nearing', 'at_limit', 'over'],
    nullable: true,
  })
  budgetStatus!: 'normal' | 'nearing' | 'at_limit' | 'over' | null;
  @ApiProperty({ type: String, nullable: true })
  monthlyBudgetAmount!: string | null;
  @ApiProperty({ type: String, nullable: true })
  annualBudgetAmount!: string | null;
  @ApiProperty({ type: HomeExpenseFilterDto })
  expenseFilter!: HomeExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeCategoryExpenseDto {
  @ApiProperty({ type: String })
  categoryId!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: Boolean })
  isActive!: boolean;
  @ApiProperty({ type: String })
  iconKey!: string;
  @ApiProperty({ type: String, nullable: true })
  colorKey!: string | null;
  @ApiProperty({ type: String })
  actualAmount!: string;
  @ApiProperty({ type: String })
  expenseCount!: string;
  @ApiProperty({
    type: HomeBudgetContextDto,
    nullable: true,
    description:
      'Current Budget configuration. Yearly amounts are annual context.',
  })
  budget!: HomeBudgetContextDto | null;
  @ApiProperty({ type: HomeCategoryMonthDto, isArray: true })
  months!: readonly HomeCategoryMonthDto[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeMonthlyBudgetCheckDto {
  @ApiProperty({ type: String })
  categoryId!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: String })
  budgetAmount!: string;
  @ApiProperty({ type: Number })
  overBudgetMonths!: number;
  @ApiProperty({ type: Number })
  eligibleMonths!: number;
  @ApiProperty({ type: HomeExpenseFilterDto, nullable: true })
  expenseFilter!: HomeExpenseFilterDto | null;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeYearlyBudgetCheckDto {
  @ApiProperty({ type: String })
  categoryId!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: String, example: '2026' })
  year!: string;
  @ApiProperty({ type: String })
  actualAmount!: string;
  @ApiProperty({ type: String })
  limitAmount!: string;
  @ApiProperty({ enum: ['normal', 'nearing', 'at_limit', 'over'] })
  status!: 'normal' | 'nearing' | 'at_limit' | 'over';
  @ApiProperty({ type: String, format: 'date' })
  usageFromDate!: string;
  @ApiProperty({ type: String, format: 'date' })
  usageToDate!: string;
  @ApiProperty({ type: HomeExpenseFilterDto })
  expenseFilter!: HomeExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeBudgetChecksDto {
  @ApiProperty({ type: HomeMonthlyBudgetCheckDto, isArray: true })
  monthly!: readonly HomeMonthlyBudgetCheckDto[];
  @ApiProperty({ type: HomeYearlyBudgetCheckDto, isArray: true })
  yearly!: readonly HomeYearlyBudgetCheckDto[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class HomeReportResponseDto {
  @ApiProperty({ type: HomeRangeDto })
  range!: HomeRangeDto;
  @ApiProperty({ type: HomeSummaryDto })
  summary!: HomeSummaryDto;
  @ApiProperty({ type: HomeMonthlyExpenseDto, isArray: true })
  monthlyExpenses!: readonly HomeMonthlyExpenseDto[];
  @ApiProperty({ type: HomeCategoryExpenseDto, isArray: true })
  categoryExpenses!: readonly HomeCategoryExpenseDto[];
  @ApiProperty({ type: HomeBudgetChecksDto })
  budgetChecks!: HomeBudgetChecksDto;
}
