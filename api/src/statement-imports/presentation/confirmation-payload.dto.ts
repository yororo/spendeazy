import {
  ApiProperty,
  ApiSchema,
  type ApiPropertyOptions,
} from '@nestjs/swagger';
import {
  Validate,
  IsUUID,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type { ConfirmationPayload } from '../application/confirmation-payload';
import {
  confirmationSchema,
  schemaIssues,
} from '../application/confirmation-schema';

@ValidatorConstraint({ name: 'closedImportField', async: false })
class ClosedImportField implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments): boolean {
    const key = arguments_.property;
    return (
      schemaIssues(value, confirmationSchema.properties![key]).length === 0
    );
  }
  defaultMessage(): string {
    return 'Invalid reviewed import field.';
  }
}

/** Closed nested schemas retain locked unknown_direction/invalid_date/invalid_amount
 * rows, null normalized/control values, page and completeness assertions.
 * The application validator also runs for non-HTTP callers. */
@ApiSchema({
  description:
    'Complete reviewed import v1. Raw duplicateReference is ephemeral; no PDF, password, page text or full account identifiers.',
})
export class ConfirmationPayloadDto implements ConfirmationPayload {
  @Validate(ClosedImportField)
  @ApiProperty(confirmationSchema.properties!.statement as ApiPropertyOptions)
  statement!: ConfirmationPayload['statement'];

  @Validate(ClosedImportField)
  @ApiProperty(confirmationSchema.properties!.evidence as ApiPropertyOptions)
  evidence!: ConfirmationPayload['evidence'];

  @Validate(ClosedImportField)
  @ApiProperty(confirmationSchema.properties!.expenses as ApiPropertyOptions)
  expenses!: ConfirmationPayload['expenses'];

  @Validate(ClosedImportField)
  @ApiProperty(confirmationSchema.properties!.excluded as ApiPropertyOptions)
  excluded!: ConfirmationPayload['excluded'];

  @Validate(ClosedImportField)
  @ApiProperty(
    confirmationSchema.properties!.rememberedRules as ApiPropertyOptions,
  )
  rememberedRules!: ConfirmationPayload['rememberedRules'];

  @Validate(ClosedImportField)
  @ApiProperty(
    confirmationSchema.properties!.acknowledgedWarnings as ApiPropertyOptions,
  )
  acknowledgedWarnings!: string[];

  @Validate(ClosedImportField)
  @ApiProperty(
    confirmationSchema.properties!
      .acknowledgedWarningDigest as ApiPropertyOptions,
  )
  acknowledgedWarningDigest!: string | null;
}

export class ImportOperationParamsDto {
  @IsUUID()
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'Frozen confirmation identity scoped to the authenticated actor and original Space.',
  })
  operationId!: string;
}

export class CommittedImportResultDto {
  @ApiProperty({ enum: ['committed'] })
  status!: 'committed';
  @ApiProperty({ type: String, format: 'uuid' })
  operationId!: string;
  @ApiProperty({ type: String, pattern: '^[1-9]\\d*$' })
  statementImportId!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  confirmedAt!: string;
  @ApiProperty({ type: String, pattern: '^[1-9]\\d*$' })
  originalExpenseCount!: string;
  @ApiProperty({
    type: String,
    pattern: '^(?:0|[1-9]\\d*)\\.\\d{2}$',
    description: 'Immutable exact PHP total at confirmation.',
  })
  originalExpenseTotal!: string;
}
