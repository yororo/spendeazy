import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'transactions' })
@Index('ix_transactions_space_purchase_date', ['spaceId', 'purchaseDate'])
@Index('ix_transactions_space_category_purchase_date', [
  'spaceId',
  'categoryId',
  'purchaseDate',
])
@Index('ix_transactions_space_deleted_purchase_date', [
  'spaceId',
  'deletedAt',
  'purchaseDate',
  'id',
])
@Index('ix_transactions_added_by_user', ['addedByUserId'])
@Index('ix_transactions_statement_import', ['statementImportId'])
@Index('ix_transactions_statement_import_space', [
  'statementImportId',
  'spaceId',
])
@Index('ix_transactions_space_import_fingerprint', [
  'spaceId',
  'importFingerprint',
])
export class TransactionEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_transactions',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'added_by_user_id' })
  addedByUserId!: string;

  @Column({ type: 'bigint', nullable: true, name: 'category_id' })
  categoryId!: string | null;

  /**
   * Manual Transactions keep this provenance unset. When present, the
   * database constrains it together with spaceId to a same-Space Statement
   * Import.
   */
  @Column({ type: 'bigint', nullable: true, name: 'statement_import_id' })
  statementImportId!: string | null;

  @Column({ type: 'date', name: 'purchase_date' })
  purchaseDate!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
    name: 'category_match_confidence',
  })
  categoryMatchConfidence!: string | null;

  @Column({
    type: 'char',
    length: 64,
    nullable: true,
    name: 'import_fingerprint',
  })
  importFingerprint!: string | null;

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
}
