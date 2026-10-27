import { ApiProperty, ApiSchema } from '@nestjs/swagger';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardExactValueDto {
  @ApiProperty({ type: String, example: '25' })
  numerator!: string;

  @ApiProperty({ type: String, example: '6' })
  denominator!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardValueWithExactDto {
  @ApiProperty({ type: DashboardExactValueDto })
  exact!: DashboardExactValueDto;

  @ApiProperty({ type: String, example: '4.2' })
  amount!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardExpenseFilterDto {
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
export class DashboardDateFilterDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-01-01' })
  fromDate!: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-06-30' })
  toDate!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardBudgetContextDto {
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  period!: 'monthly' | 'yearly';

  @ApiProperty({ type: String, example: '1200.00' })
  amount!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardRangeDto {
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
export class DashboardPlanDto extends DashboardValueWithExactDto {
  @ApiProperty({ type: Number, example: 6 })
  months!: number;
  @ApiProperty({ type: DashboardValueWithExactDto })
  monthlyEquivalent!: DashboardValueWithExactDto;
  @ApiProperty({ type: DashboardValueWithExactDto })
  annualEquivalent!: DashboardValueWithExactDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardHighestCategoryDto {
  @ApiProperty({ type: String })
  categoryId!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: String, example: '6400.00' })
  amount!: string;
  @ApiProperty({ type: DashboardExpenseFilterDto })
  expenseFilter!: DashboardExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardImportSummaryDto {
  @ApiProperty({ type: String, example: '2' })
  count!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  latestConfirmedAt!: string | null;
  @ApiProperty({ type: DashboardDateFilterDto })
  filter!: DashboardDateFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardComparisonDto {
  @ApiProperty({ enum: ['above_plan', 'below_plan', 'equal_plan', 'no_plan'] })
  direction!: 'above_plan' | 'below_plan' | 'equal_plan' | 'no_plan';
  @ApiProperty({ type: DashboardValueWithExactDto })
  difference!: DashboardValueWithExactDto;
  @ApiProperty({ type: DashboardValueWithExactDto, nullable: true })
  percentage!: DashboardValueWithExactDto | null;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardSummaryDto {
  @ApiProperty({ type: String, example: '12500.00' })
  actualAmount!: string;
  @ApiProperty({ type: String, example: '11' })
  expenseCount!: string;
  @ApiProperty({ type: DashboardPlanDto })
  planned!: DashboardPlanDto;
  @ApiProperty({ type: DashboardComparisonDto })
  comparison!: DashboardComparisonDto;
  @ApiProperty({ type: DashboardHighestCategoryDto, nullable: true })
  highestCategory!: DashboardHighestCategoryDto | null;
  @ApiProperty({ type: DashboardImportSummaryDto })
  statementImports!: DashboardImportSummaryDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardMonthlyExpenseDto {
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
  @ApiProperty({ type: DashboardExpenseFilterDto })
  expenseFilter!: DashboardExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardCategoryMonthDto {
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
  @ApiProperty({ type: DashboardExpenseFilterDto })
  expenseFilter!: DashboardExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardCategoryExpenseDto {
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
    type: DashboardBudgetContextDto,
    nullable: true,
    description:
      'Current Budget configuration. Yearly amounts are annual context.',
  })
  budget!: DashboardBudgetContextDto | null;
  @ApiProperty({ type: DashboardCategoryMonthDto, isArray: true })
  months!: readonly DashboardCategoryMonthDto[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardMonthlyBudgetCheckDto {
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
  @ApiProperty({ type: DashboardExpenseFilterDto, nullable: true })
  expenseFilter!: DashboardExpenseFilterDto | null;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardYearlyBudgetCheckDto {
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
  @ApiProperty({ type: DashboardExpenseFilterDto })
  expenseFilter!: DashboardExpenseFilterDto;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardBudgetChecksDto {
  @ApiProperty({ type: DashboardMonthlyBudgetCheckDto, isArray: true })
  monthly!: readonly DashboardMonthlyBudgetCheckDto[];
  @ApiProperty({ type: DashboardYearlyBudgetCheckDto, isArray: true })
  yearly!: readonly DashboardYearlyBudgetCheckDto[];
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class DashboardReportResponseDto {
  @ApiProperty({ type: DashboardRangeDto })
  range!: DashboardRangeDto;
  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;
  @ApiProperty({ type: DashboardMonthlyExpenseDto, isArray: true })
  monthlyExpenses!: readonly DashboardMonthlyExpenseDto[];
  @ApiProperty({ type: DashboardCategoryExpenseDto, isArray: true })
  categoryExpenses!: readonly DashboardCategoryExpenseDto[];
  @ApiProperty({ type: DashboardBudgetChecksDto })
  budgetChecks!: DashboardBudgetChecksDto;
}
