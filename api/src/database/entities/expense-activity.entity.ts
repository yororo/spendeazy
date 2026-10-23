import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

interface ExpenseActivityState {
  categoryId: string | null;
  purchaseDate: string;
  description: string;
  amount: string;
}

@Entity({ name: 'expense_activities' })
@Index('ix_expense_activities_space_expense_occurred_at', [
  'spaceId',
  'expenseId',
  'occurredAt',
  'id',
])
@Index('ux_expense_activities_created', ['expenseId'], {
  unique: true,
  where: "activity_type = 'created'",
})
export class ExpenseActivityEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_expense_activities',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'expense_id' })
  expenseId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'actor_user_id' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 20, name: 'activity_type' })
  type!: 'created' | 'edited' | 'deleted';

  @Column({ type: 'timestamptz', precision: 3, name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'jsonb', nullable: true, name: 'before_state' })
  beforeState!: ExpenseActivityState | null;

  @Column({ type: 'jsonb', nullable: true, name: 'after_state' })
  afterState!: ExpenseActivityState | null;
}
