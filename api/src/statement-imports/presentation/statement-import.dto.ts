import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Max,
  Matches,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidDomainDate } from '../../http/domain-date';
import {
  DOMAIN_DATE_PATTERN,
  POSITIVE_INTEGER_ID_PATTERN,
  POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN,
} from '../../http/validation-patterns';
import {
  DEFAULT_STATEMENT_IMPORT_PAGE_SIZE,
  MAX_STATEMENT_IMPORT_PAGE_SIZE,
} from '../application/statement-imports.service';

type ApiSchemaOptionsWithAdditionalProperties = {
  name?: string;
  description?: string;
  additionalProperties?: boolean;
};

const CONFIDENCE_PATTERN = /^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/u;

@ValidatorConstraint({ name: 'statementImportDate', async: false })
class IsStatementImportDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidDomainDate(value);
  }

  defaultMessage(): string {
    return 'Date must be a valid calendar date in YYYY-MM-DD format';
  }
}

@ValidatorConstraint({ name: 'statementImportDateBounds', async: false })
class StatementImportDateBoundsConstraint implements ValidatorConstraintInterface {
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

export class StatementImportParamsDto {
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiProperty({
    description:
      'Positive bigint Statement import identifier encoded as a string.',
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    example: '42',
  })
  statementImportId!: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class StatementImportCollectionQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsStatementImportDateConstraint)
  @Validate(StatementImportDateBoundsConstraint)
  @ApiPropertyOptional({
    description:
      'Inclusive lower Statement import date. It must be a valid calendar date in YYYY-MM-DD format and be on or before toDate when both filters are supplied.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  fromDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Validate(IsStatementImportDateConstraint)
  @ApiPropertyOptional({
    description:
      'Inclusive upper Statement import date. It must be a valid calendar date in YYYY-MM-DD format.',
    type: String,
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-31',
  })
  toDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(parsePageSize)
  @IsInt()
  @Min(1)
  @Max(MAX_STATEMENT_IMPORT_PAGE_SIZE)
  @ApiPropertyOptional({
    description:
      'Number of Statement imports to return per page. Must be between 1 and 100 inclusive; defaults to 20. The cursor is not coupled to page size.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_STATEMENT_IMPORT_PAGE_SIZE,
    default: DEFAULT_STATEMENT_IMPORT_PAGE_SIZE,
    example: DEFAULT_STATEMENT_IMPORT_PAGE_SIZE,
  })
  pageSize?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @ApiPropertyOptional({
    description:
      'Opaque base64url cursor for the next page. Reuse it only with the same date filters; cursors encode the fixed statementDate-descending, ID-descending ordering.',
    type: String,
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
    example: 'eyJ2ZXJzaW9uIjoxLCJvcmRlcmluZyI6InN0YXRlbWVudERhdGU6ZGVzYy...',
  })
  cursor?: string;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class ReviewedStatementTransactionDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(POSITIVE_INTEGER_ID_PATTERN)
  @ApiPropertyOptional({
    description:
      'Positive bigint Category identifier encoded as a string. Omit or set to null to leave the imported Transaction Uncategorized.',
    type: String,
    pattern: POSITIVE_INTEGER_ID_PATTERN.source,
    nullable: true,
    example: '42',
  })
  categoryId?: string | null;

  @IsString()
  @Validate(IsStatementImportDateConstraint)
  @ApiProperty({
    description: 'Valid calendar purchase date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-01',
  })
  purchaseDate!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  @Length(1, 500)
  @Transform(trimValue)
  @ApiProperty({
    description: 'Transaction description, trimmed before storage.',
    minLength: 1,
    maxLength: 500,
    pattern: '\\S',
    example: 'Coffee',
  })
  description!: string;

  @IsString()
  @Matches(POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN)
  @ApiProperty({
    description:
      'Positive exact two-decimal Transaction amount encoded as a string, normalized to remove redundant leading zeroes before storage.',
    pattern: POSITIVE_TWO_DECIMAL_AMOUNT_PATTERN.source,
    example: '4.50',
  })
  amount!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(CONFIDENCE_PATTERN)
  @ApiPropertyOptional({
    description:
      'Optional category-match confidence encoded as a decimal string between 0 and 1 inclusive, with up to four fractional digits.',
    type: String,
    pattern: CONFIDENCE_PATTERN.source,
    nullable: true,
    example: '0.9000',
  })
  categoryMatchConfidence?: string | null;
}

@ApiSchema({
  additionalProperties: false,
} as ApiSchemaOptionsWithAdditionalProperties)
export class CommitReviewedStatementImportDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @Transform(trimValue)
  @ApiProperty({
    description: 'Statement file name, trimmed before storage.',
    minLength: 1,
    maxLength: 255,
    pattern: '\\S',
    example: 'august.pdf',
  })
  fileName!: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/u)
  @ApiProperty({
    description:
      'Lowercase SHA-256 digest asserted by the client. It is used for exact-file duplicate detection and is never returned.',
    pattern: '^[0-9a-f]{64}$',
    example: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  })
  fileHash!: string;

  @IsString()
  @Validate(IsStatementImportDateConstraint)
  @ApiProperty({
    description: 'Valid calendar statement date encoded as YYYY-MM-DD.',
    format: 'date',
    pattern: DOMAIN_DATE_PATTERN.source,
    example: '2026-08-31',
  })
  statementDate!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Transform(trimValue)
  @ApiProperty({
    description: 'Statement bank name, trimmed before storage.',
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    example: 'Example Bank',
  })
  bank!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @Transform(trimValue)
  @ApiPropertyOptional({
    description: 'Optional card type, trimmed before storage when supplied.',
    type: String,
    minLength: 1,
    maxLength: 100,
    pattern: '\\S',
    nullable: true,
    example: 'visa',
  })
  cardType?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewedStatementTransactionDto)
  @ApiProperty({
    description:
      'Reviewed Transactions to commit. The array may be empty; each row is normalized and validated before it is stored.',
    type: 'array',
    items: { $ref: getSchemaPath(ReviewedStatementTransactionDto) },
  })
  transactions!: ReviewedStatementTransactionDto[];

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Acknowledge all probable-duplicate review signals. Defaults to false; exact file duplicates cannot be acknowledged.',
    default: false,
    example: false,
  })
  acknowledgeProbableDuplicates?: boolean;
}

function trimValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function parsePageSize({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d+$/u.test(value)
    ? Number(value)
    : value;
}
