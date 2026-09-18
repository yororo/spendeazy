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
import type {
  TransactionCategoryState,
  TransactionSource,
} from '../application/transaction-store';
import { TRANSACTION_DESCRIPTION_MAX_LENGTH } from '../application/transaction-store';
import {
  DEFAULT_TRANSACTION_PAGE_SIZE,
  MAX_TRANSACTION_PAGE_SIZE,
} from '../application/transactions.service';

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

@ValidatorConstraint({ name: 'transactionDateBounds', async: false })
class TransactionDateBoundsConstraint implements ValidatorConstraintInterface {
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

export class TransactionParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description: 'Positive bigint Transaction identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  transactionId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class TransactionCollectionQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsDomainDateConstraint)
  @Validate(TransactionDateBoundsConstraint)
  @ApiPropertyOptional({
    description:
      'Inclusive lower purchase date. It must be a valid calendar date in YYYY-MM-DD format and be on or before toDate when both filters are supplied.',
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
    description:
      'Inclusive upper purchase date. It must be a valid calendar date in YYYY-MM-DD format.',
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
      'Only Transactions assigned to this positive bigint Category identifier owned by the authenticated User.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn(['categorized', 'uncategorized'])
  @ApiPropertyOptional({
    description:
      'Whether to return categorized Transactions or Uncategorized Transactions.',
    enum: ['categorized', 'uncategorized'],
    example: 'categorized',
  })
  categoryState?: TransactionCategoryState;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Only Transactions committed from this positive bigint Statement import identifier owned by the authenticated User.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '10',
  })
  statementImportId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsIn(['manual', 'imported'])
  @ApiPropertyOptional({
    description:
      'Whether to return manually recorded or imported Transactions.',
    enum: ['manual', 'imported'],
    example: 'imported',
  })
  source?: TransactionSource;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(parsePageSize)
  @IsInt()
  @Min(1)
  @Max(MAX_TRANSACTION_PAGE_SIZE)
  @ApiPropertyOptional({
    description:
      'Number of Transactions to return per page. Must be between 1 and 100 inclusive; defaults to 20. The cursor is not coupled to page size.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_TRANSACTION_PAGE_SIZE,
    default: DEFAULT_TRANSACTION_PAGE_SIZE,
    example: DEFAULT_TRANSACTION_PAGE_SIZE,
  })
  pageSize?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @ApiPropertyOptional({
    description:
      'Opaque base64url cursor for the next page. Reuse it only with the same filters; cursors encode the fixed purchaseDate-descending, ID-descending ordering.',
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
export class CreateManualTransactionDto {
  @IsString()
  @Validate(IsDomainDateConstraint)
  @ApiProperty({
    description: 'Valid calendar purchase date in YYYY-MM-DD format.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  @Transform(trimDescription)
  @ApiProperty({
    description: 'Transaction description, trimmed before storage.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive bigint Category identifier encoded as a string. Omit or set to null to leave the Transaction Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId?: string | null;
}

@ApiSchema({
  additionalProperties: false,
  minProperties: 1,
} as ApiSchemaOptionsWithAdditionalProperties)
@requireAtLeastOneField(
  ['purchaseDate', 'description', 'amount', 'categoryId'],
  'At least one transaction field is required',
)
export class UpdateManualTransactionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsDomainDateConstraint)
  @ApiPropertyOptional({
    description: 'Valid calendar purchase date in YYYY-MM-DD format.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  @Transform(trimDescription)
  @ApiPropertyOptional({
    description: 'Transaction description, trimmed before storage.',
    minLength: 1,
    maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH,
    pattern: '\\S',
    example: 'Coffee',
  })
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, with up to 13 integer digits.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive bigint Category identifier encoded as a string. Omit or set to null to leave the Transaction Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId?: string | null;
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
