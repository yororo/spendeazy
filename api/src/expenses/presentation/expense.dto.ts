import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Max,
  Min,
  Matches,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';
import { requireAtLeastOneField } from '../../http/require-at-least-one-field';
import {
  DOMAIN_DATE_PATTERN,
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';
import { isValidDomainDate } from '../../http/domain-date';
import type { ExpenseSource } from '../application/expense-store';
import { EXPENSE_DESCRIPTION_MAX_LENGTH } from '../application/expense-store';
import {
  DEFAULT_EXPENSE_PAGE_SIZE,
  MAX_EXPENSE_PAGE_SIZE,
} from '../application/expenses.service';

export { isValidDomainDate } from '../../http/domain-date';

@ValidatorConstraint({ name: 'domainDate', async: false })
class IsDomainDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidDomainDate(value);
  }

  defaultMessage(): string {
    return 'Date must be a valid calendar date in YYYY-MM-DD format';
  }
}

@ValidatorConstraint({ name: 'expenseDateBounds', async: false })
class ExpenseDateBoundsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    const query = args?.object as { toDate?: unknown } | undefined;
    return (
      query === undefined ||
      typeof value !== 'string' ||
      typeof query.toDate !== 'string' ||
      value <= query.toDate
    );
  }

  defaultMessage(): string {
    return 'fromDate must be on or before toDate';
  }
}

export class ExpenseParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description: 'Positive bigint Expense identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  expenseId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ExpenseCollectionQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsDomainDateConstraint)
  @Validate(ExpenseDateBoundsConstraint)
  @ApiPropertyOptional({
    description:
      'Inclusive lower Expense date in YYYY-MM-DD format; it must be on or before toDate when both filters are supplied.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  fromDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsDomainDateConstraint)
  @ApiPropertyOptional({
    description: 'Inclusive upper Expense date in YYYY-MM-DD format.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-31',
  })
  toDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Only Expenses assigned to this positive bigint Category identifier in the authorized Space.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Only Expenses committed from this positive bigint Statement Import identifier in the authorized Space.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '10',
  })
  statementImportId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn(['manual', 'imported'])
  @ApiPropertyOptional({
    description: 'Whether to return manually recorded or imported Expenses.',
    enum: ['manual', 'imported'],
    example: 'imported',
  })
  source?: ExpenseSource;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, EXPENSE_DESCRIPTION_MAX_LENGTH)
  @Transform(trimDescription)
  @ApiPropertyOptional({
    description: 'Case-insensitive text contained in the Expense description.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    example: 'groceries',
  })
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn(['newest', 'oldest'])
  @ApiPropertyOptional({
    description:
      'Expense date ordering. Newest is the default; deleted Expenses retain their fixed deletion-time ordering.',
    enum: ['newest', 'oldest'],
    default: 'newest',
    example: 'oldest',
  })
  sort?: 'newest' | 'oldest';

  @ValidateIf((_, value) => value !== undefined)
  @Transform(parsePageSize)
  @IsInt()
  @Min(1)
  @Max(MAX_EXPENSE_PAGE_SIZE)
  @ApiPropertyOptional({
    description:
      'Number of Expenses to return per page. Must be between 1 and 100 inclusive; defaults to 20. The cursor is not coupled to page size.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_EXPENSE_PAGE_SIZE,
    default: DEFAULT_EXPENSE_PAGE_SIZE,
    example: DEFAULT_EXPENSE_PAGE_SIZE,
  })
  pageSize?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @ApiPropertyOptional({
    description:
      'Opaque base64url cursor for the next page. Reuse it only with the same Space, filters and sort selection; page size is not part of the cursor.',
    type: String,
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
    example: 'eyJ2ZXJzaW9uIjoxLCJvcmRlcmluZyI6InB1cmNoYXNlRGF0ZTpkZXNjLG...',
  })
  cursor?: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CreateManualExpenseDto {
  @IsString()
  @Validate(IsDomainDateConstraint)
  @ApiProperty({
    description: 'Valid calendar Expense date in YYYY-MM-DD format.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  expenseDate!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, EXPENSE_DESCRIPTION_MAX_LENGTH)
  @Transform(trimDescription)
  @ApiProperty({
    description: 'Expense description, trimmed before storage.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiProperty({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description:
      'Required positive bigint Category identifier encoded as a string.',
    type: String,
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
  ['expenseDate', 'description', 'amount', 'categoryId'],
  'At least one expense field is required',
)
export class UpdateManualExpenseDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsDomainDateConstraint)
  @ApiPropertyOptional({
    description: 'Valid calendar Expense date in YYYY-MM-DD format.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  expenseDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, EXPENSE_DESCRIPTION_MAX_LENGTH)
  @Transform(trimDescription)
  @ApiPropertyOptional({
    description: 'Expense description, trimmed before storage.',
    minLength: 1,
    maxLength: EXPENSE_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive exact two-decimal Expense amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description: 'Positive bigint Category identifier encoded as a string.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Opaque decimal revision returned by the last read. A stale edit is rejected.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '3',
  })
  expectedRevision?: string;
}

@ApiSchema({
  additionalProperties: false,
  minProperties: 2,
} as ApiSchemaOptionsWithAdditionalProperties)
export class UpdateSpaceExpenseDto extends UpdateManualExpenseDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description:
      'Opaque decimal revision from the last read; required for edits.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    required: true,
    example: '3',
  })
  declare expectedRevision: string;
}

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
  minProperties?: number;
};

function trimDescription({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parsePageSize({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d+$/u.test(value)
    ? Number(value)
    : value;
}
