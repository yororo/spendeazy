import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type {
  ConfirmedExpense,
  PrivateConfirmationPayload,
} from '../../statement-imports/application/confirmation-payload';

@Entity({ name: 'statement_import_rows' })
@Unique('uq_statement_import_rows_source', ['statementImportId', 'sourceRowId'])
@Unique('uq_statement_import_rows_expense_link', [
  'id',
  'statementImportId',
  'spaceId',
  'sourceRowId',
])
export class StatementImportRowEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id!: string;
  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;
  @Column({ type: 'bigint', name: 'statement_import_id' })
  statementImportId!: string;
  @Column({ type: 'varchar', length: 100, name: 'source_row_id' })
  sourceRowId!: string;
  @Column({ type: 'varchar', length: 10 })
  disposition!: 'included' | 'excluded';
  @Column({ type: 'jsonb', name: 'original_evidence' })
  originalEvidence!: PrivateConfirmationPayload['evidence']['transactions'][number];
  @Column({ type: 'jsonb', nullable: true, name: 'confirmed_values' })
  confirmedValues!: ConfirmedExpense | null;
  @Column({
    type: 'bigint',
    name: 'confirmed_category_id',
    nullable: true,
    asExpression: "((confirmed_values ->> 'categoryId')::bigint)",
    generatedType: 'STORED',
    insert: false,
    update: false,
  })
  confirmedCategoryId!: string | null;
  @Column({ type: 'jsonb', nullable: true })
  exclusion!: PrivateConfirmationPayload['excluded'][number] | null;
}
