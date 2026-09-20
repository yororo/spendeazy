import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CategoryColor } from '../../categories/application/category-color';

@Entity({ name: 'categories' })
@Index('ux_categories_space_name', ['spaceId', 'name'], { unique: true })
@Index('ix_categories_user_active', ['userId', 'isActive'])
@Index('ix_categories_space_active', ['spaceId', 'isActive'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_categories',
  })
  id!: string;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: string;

  @Column({ type: 'bigint', name: 'space_id' })
  spaceId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color!: CategoryColor | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', precision: 3, name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3, name: 'updated_at' })
  updatedAt!: Date;
}
