import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'transactions' })
@Index('ix_transactions_user_purchase_date', ['userId', 'purchaseDate'])
@Index('ix_transactions_user_category_purchase_date', [
  'userId',
  'categoryId',
  'purchaseDate',
])
@Index('ix_transactions_statement_import', ['statementImportId'])
@Index('ix_transactions_user_import_fingerprint', [
  'userId',
  'importFingerprint',
])
export class TransactionEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_transactions',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'bigint', nullable: true, name: 'category_id' })
  categoryId!: string | null;

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
}
