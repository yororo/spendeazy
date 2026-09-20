import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'statement_imports' })
@Index('ux_statement_imports_space_file_hash', ['spaceId', 'fileHash'], {
  unique: true,
})
@Index('ix_statement_imports_user_statement_date', ['userId', 'statementDate'])
@Index('ix_statement_imports_space_statement_date', [
  'spaceId',
  'statementDate',
])
@Index('ix_statement_imports_imported_by_user', ['importedByUserId'])
export class StatementImportEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_statement_imports',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'imported_by_user_id' })
  importedByUserId!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  @Column({ type: 'char', length: 64, name: 'file_hash' })
  fileHash!: string;

  @Column({ type: 'date', name: 'statement_date' })
  statementDate!: string;

  @Column({ type: 'varchar', length: 100 })
  bank!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'card_type' })
  cardType!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'imported_at' })
  importedAt!: Date;
}
