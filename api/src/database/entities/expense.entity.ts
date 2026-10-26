import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'expenses' })
@Index('ix_expenses_space_expense_date', ['spaceId', 'expenseDate'])
@Index('ix_expenses_space_category_expense_date', [
  'spaceId',
  'categoryId',
  'expenseDate',
])
@Index('ix_expenses_space_deleted_expense_date', [
  'spaceId',
  'deletedAt',
  'expenseDate',
  'id',
])
@Index('ix_expenses_added_by_user', ['addedByUserId'])
@Index('ix_expenses_statement_import', ['statementImportId'])
@Index('ix_expenses_statement_import_space', ['statementImportId', 'spaceId'])
@Index(
  'ux_expenses_statement_import_source_row',
  ['statementImportId', 'sourceRowId'],
  {
    unique: true,
    where: 'statement_import_id IS NOT NULL AND source_row_id IS NOT NULL',
  },
)
@Index('ix_expenses_space_import_fingerprint', ['spaceId', 'importFingerprint'])
@Index('ix_expenses_space_reference_hash', ['spaceId', 'referenceHash'])
export class ExpenseEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_expenses',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'added_by_user_id' })
  addedByUserId!: string;

  @Column({ type: 'bigint', name: 'category_id' })
  categoryId!: string;

  /**
   * Manual Expenses keep this provenance unset. When present, the
   * database constrains it together with spaceId to a same-Space Statement
   * Import.
   */
  @Column({ type: 'bigint', nullable: true, name: 'statement_import_id' })
  statementImportId!: string | null;

  @Column({ type: 'text', nullable: true, name: 'source_row_id' })
  sourceRowId!: string | null;

  @Column({ type: 'date', name: 'expense_date' })
  expenseDate!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({
    type: 'char',
    length: 64,
    nullable: true,
    name: 'import_fingerprint',
  })
  importFingerprint!: string | null;

  @Column({
    type: 'char',
    length: 64,
    nullable: true,
    name: 'reference_hash',
  })
  referenceHash!: string | null;

  @Column({ type: 'bigint', default: '1' })
  revision!: string;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
    name: 'deleted_at',
  })
  deletedAt!: Date | null;

  @Column({ type: 'bigint', nullable: true, name: 'deleted_by_user_id' })
  deletedByUserId!: string | null;

  @Column({ type: 'bigint', nullable: true, name: 'deleted_from_revision' })
  deletedFromRevision!: string | null;
}
