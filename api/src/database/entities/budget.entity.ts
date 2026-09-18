import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'budgets' })
@Index('ux_budgets_category', ['categoryId'], { unique: true })
export class BudgetEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_budgets',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'category_id' })
  categoryId!: string;

  @Column({ type: 'varchar', length: 20 })
  period!: 'monthly' | 'yearly';

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount!: string;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
