import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Index,
} from 'typeorm';
import type { CommittedImportResult } from '../../statement-imports/application/confirmation-payload';

@Entity({ name: 'statement_import_operations' })
@Index('uq_statement_import_operations_import', ['statementImportId'], {
  unique: true,
  where: 'statement_import_id IS NOT NULL',
})
export class StatementImportOperationEntity {
  @PrimaryColumn({ type: 'bigint', name: 'actor_user_id' })
  actorUserId!: string;
  @PrimaryColumn({ type: 'bigint', name: 'space_id' })
  spaceId!: string;
  @PrimaryColumn({ type: 'uuid', name: 'operation_id' })
  operationId!: string;
  @Column({ type: 'char', length: 64, name: 'request_hash' })
  requestHash!: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'committed' | 'not_committed';
  @Column({ type: 'bigint', nullable: true, name: 'statement_import_id' })
  statementImportId!: string | null;
  @Column({ type: 'jsonb', nullable: true, name: 'success_result' })
  successResult!: CommittedImportResult | null;
  @Column({ type: 'jsonb', nullable: true, name: 'failure' })
  failure!: { code: string; details: { field: string; code: string }[] } | null;
  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;
}
