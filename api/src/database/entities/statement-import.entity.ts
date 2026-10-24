import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'statement_imports' })
@Unique('uq_statement_imports_id_space_id', ['id', 'spaceId'])
@Index('ix_statement_imports_space_confirmed_at', ['spaceId', 'importedAt'])
@Index('ix_statement_imports_imported_by_user', ['importedByUserId'])
export class StatementImportEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_statement_imports',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'imported_by_user_id' })
  importedByUserId!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  @Column({ type: 'char', length: 64, name: 'file_hash' })
  fileHash!: string;

  @Column({ type: 'date', nullable: true, name: 'statement_date' })
  statementDate!: string | null;

  @Column({ type: 'varchar', length: 100 })
  provider!: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'account_format',
  })
  accountFormat!: string | null;

  @Column({ type: 'varchar', length: 30, name: 'statement_type' })
  statementType!: 'credit_card' | 'e_wallet';

  @Column({
    type: 'date',
    nullable: true,
    name: 'history_from_date',
  })
  historyFromDate!: string | null;

  @Column({
    type: 'date',
    nullable: true,
    name: 'history_to_date',
  })
  historyToDate!: string | null;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
    name: 'total_debit',
  })
  totalDebit!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'imported_at' })
  importedAt!: Date;
}
