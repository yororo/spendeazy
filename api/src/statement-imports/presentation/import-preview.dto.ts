import { ApiProperty } from '@nestjs/swagger';
import type { ImportAdvisoryWarning } from '../application/confirmation-payload';
export class ImportAdvisoryWarningDto implements ImportAdvisoryWarning {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ['reconciliation', 'exact_file', 'probable_duplicate'] })
  type!: ImportAdvisoryWarning['type'];
  @ApiProperty({ type: [String] }) sourceRowIds!: string[];
  @ApiProperty({ type: [String] }) expenseIds!: string[];
  @ApiProperty({ type: [String] }) statementImportIds!: string[];
  @ApiProperty({ type: String }) message!: string;
}
export class ImportPreviewDto {
  @ApiProperty({ type: [ImportAdvisoryWarningDto] })
  warnings!: ImportAdvisoryWarningDto[];
  @ApiProperty({ type: String, pattern: '^[0-9a-f]{64}$' })
  warningDigest!: string;
}
