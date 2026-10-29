import { Transform, type TransformFnParams } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Max,
  Matches,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isValidDomainDate } from '../../http/domain-date';
import {
  DOMAIN_DATE_PATTERN,
  POSITIVE_INTEGER_ID_PATTERN,
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
      'Inclusive lower Statement confirmation date in Asia/Manila, encoded as a valid calendar date in YYYY-MM-DD format. It must be on or before toDate when both filters are supplied.',
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
      'Inclusive upper Statement confirmation date in Asia/Manila, encoded as a valid calendar date in YYYY-MM-DD format.',
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
      'Opaque base64url cursor for the next page. Reuse it only with the same date filters; results are ordered by confirmation time descending, then Statement Import ID descending. Page size is not part of the cursor.',
    type: String,
    minLength: 1,
    pattern: '^[A-Za-z0-9_-]+$',
    example: 'eyJ2ZXJzaW9uIjoxLCJvcmRlcmluZyI6InN0YXRlbWVudERhdGU6ZGVzYy...',
  })
  cursor?: string;
}

function parsePageSize({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d+$/u.test(value)
    ? Number(value)
    : value;
}
