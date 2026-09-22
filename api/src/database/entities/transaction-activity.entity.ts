import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

interface TransactionActivityState {
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

@Entity({ name: 'transaction_activities' })
@Index('ix_transaction_activities_space_transaction_occurred_at', [
  'spaceId',
  'transactionId',
  'occurredAt',
  'id',
])
@Index('ux_transaction_activities_created', ['transactionId'], {
  unique: true,
  where: "activity_type = 'created'",
})
export class TransactionActivityEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_transaction_activities',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'transaction_id' })
  transactionId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'actor_user_id' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 20, name: 'activity_type' })
  type!: 'created' | 'edited' | 'deleted';

  @Column({ type: 'timestamptz', precision: 3, name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'jsonb', nullable: true, name: 'before_state' })
  beforeState!: TransactionActivityState | null;

  @Column({ type: 'jsonb', nullable: true, name: 'after_state' })
  afterState!: TransactionActivityState | null;
}
