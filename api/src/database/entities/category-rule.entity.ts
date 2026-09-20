import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'category_rules' })
@Index(
  'ux_category_rules_user_match_pattern',
  ['userId', 'matchType', 'normalizedPattern'],
  { unique: true },
)
@Index('ix_category_rules_space', ['spaceId'])
export class CategoryRuleEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_category_rules',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'bigint', name: 'category_id' })
  categoryId!: string;

  @Column({ type: 'varchar', length: 500 })
  pattern!: string;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'normalized_pattern',
  })
  normalizedPattern!: string;

  @Column({ type: 'varchar', length: 30, name: 'match_type' })
  matchType!: 'exact' | 'contains';

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
